import {
  checkAnswer,
  correctForReveal,
  createDisplayOrder,
  isValidAnswerPayload,
  tallyResponses,
} from '@bazoot/shared/answers'
import { EVENTS } from '@bazoot/shared/events'
import { ENGINE_STATE, STATUS } from '@bazoot/shared/gameStates'
import { QUESTION_TYPES, questionTypeOf } from '@bazoot/shared/questionTypes'
import { awardWithStreak, timeToPoints } from '@bazoot/shared/scoring'
import { ENGINE_TIMING } from '@bazoot/shared/timing'
import { GameError } from '../utils/errors.js'
import { sleep } from '../utils/sleep.js'
import { BUS } from './GameEventBus.js'

// Timing constants are shared with the client demo via @bazoot/shared/timing.
const START_TITLE_SECONDS = ENGINE_TIMING.startTitleSeconds
const START_COUNTDOWN_SECONDS = ENGINE_TIMING.startCountdownSeconds
const PREPARED_SECONDS = ENGINE_TIMING.preparedSeconds

const createRoundState = (currentQuestion = 0) => ({
  currentQuestion,
  playersAnswers: [], // { playerId, answerId, points } — answerId: index | index[]
  playerAnswersById: new Map(),
  answerablePlayerIds: new Set(),
  remainingAnswerablePlayerIds: new Set(),
  startTime: 0,
  displayOrder: null, // order questions: displayOrder[displayed] = original index
})

// One GameEngine per room. Owns the finite state machine, round state, scoring
// and per-target status memory (for reconnects). Publishes everything through
// the GameEventBus — no socket.io imports in this layer.
export class GameEngine {
  constructor({
    room,
    quizz,
    bus,
    scoreMax = 1000,
    defaultQuestionTime = 20,
    answerCountBroadcastMs = 100,
    onRoomChanged = () => {},
  }) {
    this.room = room
    this.quizz = quizz
    this.bus = bus
    this.scoreMax = scoreMax
    this.defaultQuestionTime = defaultQuestionTime
    this.answerCountBroadcastMs = answerCountBroadcastMs
    this.onRoomChanged = onRoomChanged

    this.state = ENGINE_STATE.LOBBY
    this.started = false
    this.runId = 0
    this.round = createRoundState()
    this.countdown = { active: false, interval: null, resolve: null }
    this.answerCountBroadcast = { timer: null, count: null }

    this.leaderboard = []
    this.tempOldLeaderboard = null

    // Reconnect memory: last status per target, mirroring the source app.
    this.lastBroadcastStatus = null
    this.managerStatus = null
    this.playerStatus = new Map()
  }

  // ── status plumbing ─────────────────────────────────────────────────────────

  broadcastStatus(name, data) {
    const status = { name, data }
    this.lastBroadcastStatus = status
    this.bus.broadcast(this.room.gameId, EVENTS.GAME_STATUS, status)
  }

  sendStatus(targetId, name, data) {
    const status = { name, data }

    if (targetId === this.room.manager.id) {
      this.managerStatus = status
    } else {
      this.playerStatus.set(targetId, status)
    }

    this.bus.sendTo(targetId, EVENTS.GAME_STATUS, status)
  }

  questionProgress() {
    return {
      current: this.round.currentQuestion + 1,
      total: this.quizz.questions.length,
    }
  }

  get currentQuestion() {
    return this.quizz.questions[this.round.currentQuestion]
  }

  questionTime(question) {
    return question.time ?? this.defaultQuestionTime
  }

  /** Stored status for a (possibly stale) player socket id, rebound to a new id. */
  takePlayerStatus(oldSocketId, newSocketId) {
    const status = this.playerStatus.get(oldSocketId)

    if (status) {
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(newSocketId, status)
    }

    if (this.round.answerablePlayerIds.has(oldSocketId)) {
      this.round.answerablePlayerIds.delete(oldSocketId)
      this.round.answerablePlayerIds.add(newSocketId)
    }

    if (this.round.remainingAnswerablePlayerIds.has(oldSocketId)) {
      this.round.remainingAnswerablePlayerIds.delete(oldSocketId)
      this.round.remainingAnswerablePlayerIds.add(newSocketId)
    }

    const playerAnswer = this.round.playerAnswersById.get(oldSocketId)

    if (playerAnswer) {
      playerAnswer.playerId = newSocketId
      this.round.playerAnswersById.delete(oldSocketId)
      this.round.playerAnswersById.set(newSocketId, playerAnswer)
    }

    const hasAnswer = playerAnswer || this.round.playerAnswersById.has(newSocketId)
    const reconnectedPlayer = this.room.players.find((player) => player.id === newSocketId)

    if (
      this.state === ENGINE_STATE.ANSWERING &&
      this.countdown.active &&
      reconnectedPlayer?.connected &&
      !hasAnswer
    ) {
      this.round.answerablePlayerIds.add(newSocketId)
      this.round.remainingAnswerablePlayerIds.add(newSocketId)
    }

    return status ?? this.lastBroadcastStatus
  }

  managerReconnectStatus() {
    return this.managerStatus ?? this.lastBroadcastStatus
  }

  removePlayerStatus(socketId) {
    this.playerStatus.delete(socketId)

    if (this.state === ENGINE_STATE.ANSWERING) {
      this.checkAllAnswered(socketId)
    }
  }

  markRoomChanged() {
    this.onRoomChanged(this.room)
  }

  beginRun() {
    this.runId += 1
    this.started = true

    return this.runId
  }

  stopRun() {
    this.runId += 1
    this.started = false
    this.clearCountdown()
    this.clearAnswerCountBroadcast()
  }

  isRunActive(runId) {
    return this.started && this.runId === runId
  }

  prepareAnsweringRound() {
    this.round.playersAnswers = []
    this.round.playerAnswersById = new Map()
    this.round.answerablePlayerIds = new Set(
      this.room.players.filter((player) => player.connected).map((player) => player.id),
    )
    this.round.remainingAnswerablePlayerIds = new Set(this.round.answerablePlayerIds)
  }

  ensureAnsweringIndexes() {
    this.round.playerAnswersById ??= new Map(
      this.round.playersAnswers.map((answer) => [answer.playerId, answer]),
    )
    this.round.answerablePlayerIds ??= new Set()
    this.round.remainingAnswerablePlayerIds ??= new Set()

    if (this.round.answerablePlayerIds.size === 0 && this.round.playersAnswers.length === 0) {
      this.round.answerablePlayerIds = new Set(
        this.room.players.filter((player) => player.connected).map((player) => player.id),
      )
    }

    if (
      this.round.remainingAnswerablePlayerIds.size === 0 &&
      this.round.answerablePlayerIds.size > 0 &&
      this.round.playersAnswers.length === 0
    ) {
      this.round.remainingAnswerablePlayerIds = new Set(this.round.answerablePlayerIds)
    }
  }

  // ── countdown (1 Hz ticks, source semantics) ───────────────────────────────

  startCountdown(seconds) {
    if (this.countdown.active) {
      return Promise.resolve()
    }

    this.countdown.active = true
    let count = seconds - 1

    return new Promise((resolve) => {
      this.countdown.resolve = resolve
      this.countdown.interval = setInterval(() => {
        if (!this.countdown.active || count <= 0) {
          this.clearCountdown()

          return
        }

        this.bus.broadcast(this.room.gameId, EVENTS.GAME_COOLDOWN, count)
        count -= 1
      }, 1000)
    })
  }

  clearCountdown() {
    this.countdown.active = false

    if (this.countdown.interval) {
      clearInterval(this.countdown.interval)
      this.countdown.interval = null
    }

    if (this.countdown.resolve) {
      const resolve = this.countdown.resolve
      this.countdown.resolve = null
      resolve()
    }
  }

  /** Ends the running countdown early (all answered / manager skip). */
  abortCountdown() {
    this.clearCountdown()
  }

  queueAnswerCountBroadcast() {
    this.answerCountBroadcast.count = this.round.playersAnswers.length

    if (this.answerCountBroadcast.timer) {
      return
    }

    if (this.answerCountBroadcastMs <= 0) {
      this.flushAnswerCountBroadcast()

      return
    }

    this.answerCountBroadcast.timer = setTimeout(() => {
      this.answerCountBroadcast.timer = null
      this.flushAnswerCountBroadcast()
    }, this.answerCountBroadcastMs)
    this.answerCountBroadcast.timer.unref?.()
  }

  flushAnswerCountBroadcast() {
    if (this.answerCountBroadcast.timer) {
      clearTimeout(this.answerCountBroadcast.timer)
      this.answerCountBroadcast.timer = null
    }

    if (this.answerCountBroadcast.count === null) {
      return
    }

    const count = this.answerCountBroadcast.count
    this.answerCountBroadcast.count = null
    this.bus.broadcast(this.room.gameId, EVENTS.GAME_PLAYER_ANSWER, count)
  }

  clearAnswerCountBroadcast() {
    if (this.answerCountBroadcast.timer) {
      clearTimeout(this.answerCountBroadcast.timer)
      this.answerCountBroadcast.timer = null
    }

    this.answerCountBroadcast.count = null
  }

  // ── transitions ─────────────────────────────────────────────────────────────

  async start() {
    if (this.started) {
      return
    }

    if (this.room.players.length === 0) {
      throw new GameError('No players connected')
    }

    const runId = this.beginRun()
    this.state = ENGINE_STATE.START_COUNTDOWN
    this.bus.publish(BUS.GAME_STARTED, {
      gameId: this.room.gameId,
      subject: this.quizz.subject,
      players: this.room.players.length,
    })

    this.broadcastStatus(STATUS.SHOW_START, {
      time: START_COUNTDOWN_SECONDS,
      subject: this.quizz.subject,
    })

    await sleep(START_TITLE_SECONDS)

    if (!this.isRunActive(runId)) {
      return
    }

    this.bus.broadcast(this.room.gameId, EVENTS.GAME_START_COOLDOWN)
    await this.startCountdown(START_COUNTDOWN_SECONDS)

    if (!this.isRunActive(runId)) {
      return
    }

    await this.newRound(runId)
  }

  async newRound(runId = this.runId) {
    const question = this.currentQuestion

    if (!this.isRunActive(runId) || !question) {
      return
    }

    this.clearAnswerCountBroadcast()
    this.state = ENGINE_STATE.PREPARED
    this.playerStatus.clear()
    this.bus.broadcast(this.room.gameId, EVENTS.GAME_UPDATE_QUESTION, this.questionProgress())
    this.bus.publish(BUS.ROUND_STARTED, {
      gameId: this.room.gameId,
      questionIndex: this.round.currentQuestion,
    })

    this.managerStatus = null
    this.broadcastStatus(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers.length,
      questionNumber: this.round.currentQuestion + 1,
    })

    await sleep(PREPARED_SECONDS)

    if (!this.isRunActive(runId)) {
      return
    }

    this.state = ENGINE_STATE.QUESTION_DISPLAY
    this.broadcastStatus(STATUS.SHOW_QUESTION, {
      question: question.question,
      image: question.image,
      cooldown: question.cooldown,
    })

    await sleep(question.cooldown)

    if (!this.isRunActive(runId)) {
      return
    }

    this.state = ENGINE_STATE.ANSWERING
    this.round.startTime = Date.now()
    this.prepareAnsweringRound()
    const answerablePlayerCount = this.round.answerablePlayerIds.size

    // Order questions: the authored order is the answer, so players see the
    // answers shuffled. Everyone (incl. manager) sees the same displayed order.
    const type = questionTypeOf(question)
    this.round.displayOrder =
      type === QUESTION_TYPES.ORDER ? createDisplayOrder(question.answers.length) : null

    const displayedAnswers = this.round.displayOrder
      ? this.round.displayOrder.map((original) => question.answers[original])
      : question.answers

    this.broadcastStatus(STATUS.SELECT_ANSWER, {
      question: question.question,
      type,
      answers: displayedAnswers,
      image: question.image,
      video: question.video,
      audio: question.audio,
      time: this.questionTime(question),
      totalPlayer: answerablePlayerCount,
    })

    const countdownFinished = this.startCountdown(this.questionTime(question))
    this.checkAllAnswered()
    await countdownFinished

    if (!this.isRunActive(runId)) {
      return
    }

    this.reveal(question)
  }

  receiveAnswer(playerSocketId, answerKey) {
    if (this.state !== ENGINE_STATE.ANSWERING) {
      return
    }

    const question = this.currentQuestion
    this.ensureAnsweringIndexes()

    if (!this.round.answerablePlayerIds.has(playerSocketId)) {
      return
    }

    if (this.round.playerAnswersById.has(playerSocketId)) {
      return
    }

    if (!isValidAnswerPayload(question, answerKey)) {
      return
    }

    const playerAnswer = {
      playerId: playerSocketId,
      answerId: answerKey,
      points: timeToPoints({
        startTime: this.round.startTime,
        timeLimitSeconds: this.questionTime(question),
        scoreMax: this.scoreMax,
      }),
    }

    this.round.playersAnswers.push(playerAnswer)
    this.round.playerAnswersById.set(playerSocketId, playerAnswer)
    this.round.remainingAnswerablePlayerIds.delete(playerSocketId)

    this.sendStatus(playerSocketId, STATUS.WAIT, {
      text: 'Waiting for the players to answer',
    })
    this.queueAnswerCountBroadcast()
    this.bus.publish(BUS.ANSWER_RECEIVED, {
      gameId: this.room.gameId,
      playerId: playerSocketId,
      answerKey,
    })

    this.checkAllAnswered()
  }

  /**
   * Ends the answer countdown once every *connected* player has answered.
   * Also called when a player disconnects mid-question, so the round never
   * waits out the full timer for someone who already left.
   */
  checkAllAnswered(disconnectedPlayerId) {
    if (this.state !== ENGINE_STATE.ANSWERING) {
      return
    }

    this.ensureAnsweringIndexes()

    if (disconnectedPlayerId) {
      this.round.answerablePlayerIds.delete(disconnectedPlayerId)
      this.round.remainingAnswerablePlayerIds.delete(disconnectedPlayerId)
    }

    if (this.round.remainingAnswerablePlayerIds.size === 0) {
      this.flushAnswerCountBroadcast()
      this.abortCountdown()
    }
  }

  reveal(question) {
    this.flushAnswerCountBroadcast()
    this.state = ENGINE_STATE.REVEAL

    const oldLeaderboard = (
      this.leaderboard.length === 0 ? this.room.players : this.leaderboard
    ).map((p) => ({ ...p }))

    const responseTotals = tallyResponses({
      question,
      playersAnswers: this.round.playersAnswers,
      displayOrder: this.round.displayOrder,
    })
    const playerAnswersById = this.round.playerAnswersById ?? new Map(
      this.round.playersAnswers.map((answer) => [answer.playerId, answer]),
    )

    const sortedPlayers = this.room.players
      .map((player) => {
        const playerAnswer = playerAnswersById.get(player.id)
        const isCorrect = playerAnswer
          ? checkAnswer({
              question,
              answerId: playerAnswer.answerId,
              displayOrder: this.round.displayOrder,
            })
          : false
        // Answer streak: consecutive correct answers carry a growing bonus;
        // a wrong/missed answer resets the run to zero.
        const streak = isCorrect ? (player.streak ?? 0) + 1 : 0
        const award =
          playerAnswer && isCorrect
            ? awardWithStreak({ basePoints: playerAnswer.points, streak })
            : { points: 0, bonus: 0 }

        player.points += award.points
        player.streak = streak

        return {
          ...player,
          lastCorrect: isCorrect,
          lastPoints: award.points,
          lastBonus: award.bonus,
          lastStreak: streak,
        }
      })
      .sort((a, b) => b.points - a.points)

    this.room.players = sortedPlayers
    this.markRoomChanged()

    sortedPlayers.forEach((player, index) => {
      const aheadPlayer = sortedPlayers[index - 1]

      this.sendStatus(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? 'Nice!' : 'Too bad',
        points: player.lastPoints,
        myPoints: player.points,
        rank: index + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
        streak: player.lastStreak,
        streakBonus: player.lastBonus,
      })
    })

    this.sendStatus(this.room.manager.id, STATUS.SHOW_RESPONSES, {
      question: question.question,
      type: questionTypeOf(question),
      responses: responseTotals,
      correct: correctForReveal({ question, displayOrder: this.round.displayOrder }),
      answers: this.round.displayOrder
        ? this.round.displayOrder.map((original) => question.answers[original])
        : question.answers,
      image: question.image,
    })

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard
    this.round.playersAnswers = []
    this.round.playerAnswersById = new Map()
    this.round.answerablePlayerIds = new Set()
    this.round.remainingAnswerablePlayerIds = new Set()
    this.bus.publish(BUS.ROUND_REVEALED, {
      gameId: this.room.gameId,
      questionIndex: this.round.currentQuestion,
    })
  }

  showLeaderboard() {
    if (this.state !== ENGINE_STATE.REVEAL) {
      return
    }

    const isLastRound = this.round.currentQuestion + 1 === this.quizz.questions.length

    if (isLastRound) {
      this.stopRun()
      this.state = ENGINE_STATE.END

      const top = this.leaderboard.slice(0, 3)
      this.broadcastStatus(STATUS.FINISHED, { subject: this.quizz.subject, top })
      this.bus.publish(BUS.GAME_ENDED, { gameId: this.room.gameId, top })

      return
    }

    this.state = ENGINE_STATE.LEADERBOARD

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.sendStatus(this.room.manager.id, STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }

  nextQuestion() {
    if (!this.started || this.state !== ENGINE_STATE.LEADERBOARD) {
      return
    }

    if (!this.quizz.questions[this.round.currentQuestion + 1]) {
      return
    }

    this.round.currentQuestion += 1
    void this.newRound(this.runId)
  }

  /** Manager skip during ANSWERING — ends the countdown, reveal follows. */
  abortRound() {
    if (!this.started || this.state !== ENGINE_STATE.ANSWERING) {
      return
    }

    this.abortCountdown()
  }

  /**
   * Rematch (END → LOBBY): keeps the room, PIN, and connected players;
   * resets scores and round state. Players who left during the game are
   * dropped so the lobby reflects who is actually present.
   */
  resetGame() {
    if (this.state !== ENGINE_STATE.END) {
      return
    }

    this.stopRun()
    this.state = ENGINE_STATE.LOBBY
    this.round = createRoundState()
    this.leaderboard = []
    this.tempOldLeaderboard = null
    this.playerStatus.clear()
    this.managerStatus = null
    this.lastBroadcastStatus = null

    this.room.players = this.room.players.filter((p) => p.connected)

    for (const player of this.room.players) {
      player.points = 0
      player.streak = 0
      delete player.lastCorrect
      delete player.lastPoints
      delete player.lastBonus
      delete player.lastStreak
    }

    this.markRoomChanged()
    this.clearAnswerCountBroadcast()

    this.bus.broadcast(this.room.gameId, EVENTS.GAME_UPDATE_QUESTION, this.questionProgress())
    this.bus.broadcast(this.room.gameId, EVENTS.GAME_TOTAL_PLAYERS, this.room.players.length)

    for (const player of this.room.players) {
      this.bus.sendTo(player.id, EVENTS.PLAYER_UPDATE_POINTS, 0)
      this.sendStatus(player.id, STATUS.WAIT, { text: 'Waiting for the players' })
    }

    this.sendStatus(this.room.manager.id, STATUS.SHOW_ROOM, {
      text: 'Waiting for the players',
      inviteCode: this.room.inviteCode,
      players: this.room.players,
    })

    this.bus.publish(BUS.GAME_RESTARTED, {
      gameId: this.room.gameId,
      players: this.room.players.length,
    })
  }

  /** Stops all timers and silences the engine (room destruction). */
  destroy() {
    this.stopRun()
  }
}
