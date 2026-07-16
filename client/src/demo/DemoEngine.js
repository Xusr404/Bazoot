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
import { DEMO_BOTS, planBotAnswer } from './bots.js'

export const DEMO_PLAYER_ID = 'demo-you'
export const DEMO_INVITE_CODE = 'DEMO'

const BOT_JOIN_GAP_SECONDS = 0.9
const AUTOPILOT_ADVANCE_SECONDS = 4
const AUTOPILOT_START_SECONDS = 2

/**
 * Client-side replay of the server GameEngine for the demo run: same states,
 * same status payloads, same shared answer/scoring logic, same timings (via
 * @bazoot/shared/timing) — but driven entirely by local timers and bots, so
 * nothing touches the server and no results are persisted.
 *
 * The hosting view talks to it like the real engine (start / abort / next /
 * leaderboard / reset); `setViewRole` flips autopilot: while the creator
 * watches the PLAYER view the host steps run themselves, while they host the
 * demo player "You" answers like a bot.
 *
 * `listener` receives UI state: onManagerStatus, onPlayerStatus (the "You"
 * player), onPlayers, onProgress, onPoints. Screen-level ticks (countdowns,
 * answer counters, lobby joins) go through the demo bus exactly like socket
 * events. `msPerSecond` scales every timer for tests.
 */
export class DemoEngine {
  constructor({ quizz, bus, listener, msPerSecond = 1000, scoreMax = 1000, rng = Math.random }) {
    this.quizz = quizz
    this.bus = bus
    this.listener = listener
    this.msPerSecond = msPerSecond
    this.scoreMax = scoreMax
    this.rng = rng

    this.alive = true
    this.state = ENGINE_STATE.LOBBY
    this.started = false
    this.viewRole = 'manager'

    this.players = []
    this.round = { currentQuestion: 0, playersAnswers: [], startTime: 0, displayOrder: null }
    this.leaderboard = []
    this.tempOldLeaderboard = null

    this.timers = new Set()
    this.countdown = { active: false, timer: null, resolve: null }
    this.autopilotTimer = null
    this.youAnswerTimer = null
  }

  // ── timers (all tracked so destroy() silences everything) ─────────────────

  schedule(fn, seconds) {
    const id = setTimeout(() => {
      this.timers.delete(id)

      if (this.alive) {
        fn()
      }
    }, seconds * this.msPerSecond)

    this.timers.add(id)

    return id
  }

  sleep(seconds) {
    return new Promise((resolve) => this.schedule(resolve, seconds))
  }

  destroy() {
    this.alive = false
    this.started = false

    for (const id of this.timers) {
      clearTimeout(id)
    }

    this.timers.clear()
    this.clearCountdown()
  }

  // ── status plumbing (mirrors GameEngine broadcast/send semantics) ─────────

  broadcastStatus(name, data) {
    this.listener.onManagerStatus({ name, data })
    this.listener.onPlayerStatus({ name, data })
  }

  sendManagerStatus(name, data) {
    this.listener.onManagerStatus({ name, data })
  }

  sendYouStatus(name, data) {
    this.listener.onPlayerStatus({ name, data })
  }

  questionProgress() {
    return { current: this.round.currentQuestion + 1, total: this.quizz.questions.length }
  }

  get currentQuestion() {
    return this.quizz.questions[this.round.currentQuestion]
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
      this.countdown.timer = setInterval(() => {
        if (!this.alive || !this.countdown.active || count <= 0) {
          this.clearCountdown()

          return
        }

        this.bus.emit(EVENTS.GAME_COOLDOWN, count)
        count -= 1
      }, this.msPerSecond)
    })
  }

  clearCountdown() {
    this.countdown.active = false

    if (this.countdown.timer) {
      clearInterval(this.countdown.timer)
      this.countdown.timer = null
    }

    if (this.countdown.resolve) {
      const resolve = this.countdown.resolve
      this.countdown.resolve = null
      resolve()
    }
  }

  abortCountdown() {
    this.countdown.active &&= false
  }

  // ── lobby ───────────────────────────────────────────────────────────────────

  /** Opens the demo lobby: "You" joins immediately, bots trickle in. */
  begin() {
    this.sendLobbyStatuses()
    this.joinPlayer({ id: DEMO_PLAYER_ID, username: 'You' })

    DEMO_BOTS.forEach((bot, index) => {
      this.schedule(() => {
        if (!this.started) {
          this.joinPlayer(bot)

          if (index === DEMO_BOTS.length - 1) {
            this.maybeAutopilot()
          }
        }
      }, BOT_JOIN_GAP_SECONDS * (index + 1))
    })
  }

  sendLobbyStatuses() {
    this.sendManagerStatus(STATUS.SHOW_ROOM, {
      text: 'Waiting for the players',
      inviteCode: DEMO_INVITE_CODE,
      players: [...this.players],
    })
    this.sendYouStatus(STATUS.WAIT, { text: 'Waiting for the host to start the game' })
    this.listener.onProgress(null)
  }

  // The lobby status carries the current player list so the room screen shows
  // everyone even when it remounts after a view switch.
  refreshLobbyStatus() {
    if (this.state === ENGINE_STATE.LOBBY) {
      this.sendManagerStatus(STATUS.SHOW_ROOM, {
        text: 'Waiting for the players',
        inviteCode: DEMO_INVITE_CODE,
        players: [...this.players],
      })
    }
  }

  joinPlayer({ id, username, accuracy }) {
    const player = { id, username, accuracy, points: 0, connected: true }
    this.players.push(player)
    this.listener.onPlayers([...this.players])
    this.bus.emit(EVENTS.MANAGER_NEW_PLAYER, player)
    this.bus.emit(EVENTS.GAME_TOTAL_PLAYERS, this.players.length)
    this.refreshLobbyStatus()
  }

  /** Demo kick — bots only; the demo player "You" stays. */
  kickPlayer(playerId) {
    if (playerId === DEMO_PLAYER_ID) {
      return false
    }

    this.players = this.players.filter((p) => p.id !== playerId)
    this.listener.onPlayers([...this.players])
    this.bus.emit(EVENTS.MANAGER_PLAYER_KICKED, playerId)
    this.bus.emit(EVENTS.GAME_TOTAL_PLAYERS, this.players.length)
    this.refreshLobbyStatus()
    this.checkAllAnswered()

    return true
  }

  // ── view role / autopilot ───────────────────────────────────────────────────

  setViewRole(role) {
    this.viewRole = role

    if (this.autopilotTimer) {
      clearTimeout(this.autopilotTimer)
      this.timers.delete(this.autopilotTimer)
      this.autopilotTimer = null
    }

    if (role === 'player' && this.youAnswerTimer) {
      // Back in the player seat — cancel the pending auto-answer for "You".
      clearTimeout(this.youAnswerTimer)
      this.timers.delete(this.youAnswerTimer)
      this.youAnswerTimer = null
    }

    if (role === 'manager' && this.state === ENGINE_STATE.ANSWERING) {
      this.scheduleYouAutoAnswer()
    }

    this.maybeAutopilot()
  }

  /** While the creator is in the player view, the host advances itself. */
  maybeAutopilot() {
    if (this.viewRole !== 'player' || this.autopilotTimer) {
      return
    }

    const actions = {
      [ENGINE_STATE.LOBBY]: () => this.advance(EVENTS.MANAGER_START_GAME),
      [ENGINE_STATE.REVEAL]: () => this.showLeaderboard(),
      [ENGINE_STATE.LEADERBOARD]: () => this.nextQuestion(),
    }
    const action = actions[this.state]

    if (!action) {
      return
    }

    const delay =
      this.state === ENGINE_STATE.LOBBY ? AUTOPILOT_START_SECONDS : AUTOPILOT_ADVANCE_SECONDS

    this.autopilotTimer = this.schedule(() => {
      this.autopilotTimer = null
      action()
    }, delay)
  }

  /** Host-view "Next"-button events, same contract as the live manager page. */
  advance(event) {
    const actions = {
      [EVENTS.MANAGER_START_GAME]: () => this.start(),
      [EVENTS.MANAGER_ABORT_QUIZ]: () => this.abortRound(),
      [EVENTS.MANAGER_SHOW_LEADERBOARD]: () => this.showLeaderboard(),
      [EVENTS.MANAGER_NEXT_QUESTION]: () => this.nextQuestion(),
      [EVENTS.MANAGER_RESET_GAME]: () => this.resetGame(),
    }

    actions[event]?.()
  }

  // ── game flow (port of GameEngine.start/newRound/reveal/…) ────────────────

  async start() {
    if (this.started || this.players.length === 0) {
      return
    }

    this.started = true
    this.state = ENGINE_STATE.START_COUNTDOWN

    this.broadcastStatus(STATUS.SHOW_START, {
      time: ENGINE_TIMING.startCountdownSeconds,
      subject: this.quizz.subject,
    })

    await this.sleep(ENGINE_TIMING.startTitleSeconds)

    if (!this.started) {
      return
    }

    this.bus.emit(EVENTS.GAME_START_COOLDOWN)
    await this.startCountdown(ENGINE_TIMING.startCountdownSeconds)

    await this.newRound()
  }

  async newRound() {
    const question = this.currentQuestion

    if (!this.started || !question) {
      return
    }

    this.state = ENGINE_STATE.PREPARED
    this.listener.onProgress(this.questionProgress())
    this.bus.emit(EVENTS.GAME_UPDATE_QUESTION, this.questionProgress())

    this.broadcastStatus(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers.length,
      questionNumber: this.round.currentQuestion + 1,
    })

    await this.sleep(ENGINE_TIMING.preparedSeconds)

    if (!this.started) {
      return
    }

    this.state = ENGINE_STATE.QUESTION_DISPLAY
    this.broadcastStatus(STATUS.SHOW_QUESTION, {
      question: question.question,
      image: question.image,
      cooldown: question.cooldown,
    })

    await this.sleep(question.cooldown)

    if (!this.started) {
      return
    }

    this.state = ENGINE_STATE.ANSWERING
    this.round.startTime = Date.now()

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
      time: question.time,
      totalPlayer: this.players.length,
    })

    this.scheduleBotAnswers(question)

    if (this.viewRole === 'manager') {
      this.scheduleYouAutoAnswer()
    }

    await this.startCountdown(question.time)

    if (!this.started) {
      return
    }

    this.reveal(question)
  }

  scheduleBotAnswers(question) {
    for (const player of this.players) {
      if (player.id === DEMO_PLAYER_ID) {
        continue
      }

      // Bots answer somewhere in the first ~15–85% of the time limit.
      const delay = question.time * (0.15 + this.rng() * 0.7)

      this.schedule(() => {
        if (this.state === ENGINE_STATE.ANSWERING) {
          this.receiveAnswer(
            player.id,
            planBotAnswer(question, this.round.displayOrder, player.accuracy ?? 0.5, this.rng),
          )
        }
      }, delay)
    }
  }

  scheduleYouAutoAnswer() {
    const question = this.currentQuestion

    if (
      this.youAnswerTimer ||
      this.state !== ENGINE_STATE.ANSWERING ||
      this.round.playersAnswers.some((a) => a.playerId === DEMO_PLAYER_ID)
    ) {
      return
    }

    const delay = question.time * (0.15 + this.rng() * 0.5)

    this.youAnswerTimer = this.schedule(() => {
      this.youAnswerTimer = null

      if (this.state === ENGINE_STATE.ANSWERING) {
        this.receiveAnswer(
          DEMO_PLAYER_ID,
          planBotAnswer(question, this.round.displayOrder, 0.75, this.rng),
        )
      }
    }, delay)
  }

  receiveAnswer(playerId, answerKey) {
    if (this.state !== ENGINE_STATE.ANSWERING) {
      return
    }

    const question = this.currentQuestion
    const player = this.players.find((p) => p.id === playerId)

    if (
      !player ||
      this.round.playersAnswers.some((a) => a.playerId === playerId) ||
      !isValidAnswerPayload(question, answerKey)
    ) {
      return
    }

    this.round.playersAnswers.push({
      playerId,
      answerId: answerKey,
      points: timeToPoints({
        startTime: this.round.startTime,
        timeLimitSeconds: question.time,
        scoreMax: this.scoreMax,
      }),
    })

    if (playerId === DEMO_PLAYER_ID) {
      this.sendYouStatus(STATUS.WAIT, { text: 'Waiting for the players to answer' })
    }

    this.bus.emit(EVENTS.GAME_PLAYER_ANSWER, this.round.playersAnswers.length, playerId)
    this.bus.emit(EVENTS.GAME_TOTAL_PLAYERS, this.players.length)

    this.checkAllAnswered()
  }

  checkAllAnswered() {
    if (this.state !== ENGINE_STATE.ANSWERING) {
      return
    }

    if (this.round.playersAnswers.length >= this.players.length) {
      this.abortCountdown()
    }
  }

  reveal(question) {
    this.state = ENGINE_STATE.REVEAL

    const oldLeaderboard = (this.leaderboard.length === 0 ? this.players : this.leaderboard).map(
      (p) => ({ ...p }),
    )

    const responseTotals = tallyResponses({
      question,
      playersAnswers: this.round.playersAnswers,
      displayOrder: this.round.displayOrder,
    })

    const sortedPlayers = this.players
      .map((player) => {
        const playerAnswer = this.round.playersAnswers.find((a) => a.playerId === player.id)
        const isCorrect = playerAnswer
          ? checkAnswer({
              question,
              answerId: playerAnswer.answerId,
              displayOrder: this.round.displayOrder,
            })
          : false
        const streak = isCorrect ? (player.streak ?? 0) + 1 : 0
        const award =
          playerAnswer && isCorrect
            ? awardWithStreak({ basePoints: playerAnswer.points, streak })
            : { points: 0, bonus: 0 }

        return {
          ...player,
          points: player.points + award.points,
          streak,
          lastCorrect: isCorrect,
          lastPoints: award.points,
          lastBonus: award.bonus,
          lastStreak: streak,
        }
      })
      .sort((a, b) => b.points - a.points)

    this.players = sortedPlayers
    this.listener.onPlayers([...sortedPlayers])

    const youIndex = sortedPlayers.findIndex((p) => p.id === DEMO_PLAYER_ID)

    if (youIndex !== -1) {
      const you = sortedPlayers[youIndex]
      const aheadPlayer = sortedPlayers[youIndex - 1]

      this.listener.onPoints(you.points)
      this.sendYouStatus(STATUS.SHOW_RESULT, {
        correct: you.lastCorrect,
        message: you.lastCorrect ? 'Nice!' : 'Too bad',
        points: you.lastPoints,
        myPoints: you.points,
        rank: youIndex + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
        streak: you.lastStreak,
        streakBonus: you.lastBonus,
      })
    }

    this.sendManagerStatus(STATUS.SHOW_RESPONSES, {
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

    this.maybeAutopilot()
  }

  showLeaderboard() {
    const isLastRound = this.round.currentQuestion + 1 === this.quizz.questions.length

    if (isLastRound) {
      this.started = false
      this.state = ENGINE_STATE.END

      const top = this.leaderboard.slice(0, 3)
      this.broadcastStatus(STATUS.FINISHED, { subject: this.quizz.subject, top })

      return
    }

    this.state = ENGINE_STATE.LEADERBOARD

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.sendManagerStatus(STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
    this.maybeAutopilot()
  }

  nextQuestion() {
    if (!this.started || !this.quizz.questions[this.round.currentQuestion + 1]) {
      return
    }

    this.round.currentQuestion += 1
    void this.newRound()
  }

  abortRound() {
    if (this.started) {
      this.abortCountdown()
    }
  }

  /** Rematch from the demo podium: same players, scores reset. */
  resetGame() {
    if (this.state !== ENGINE_STATE.END) {
      return
    }

    this.state = ENGINE_STATE.LOBBY
    this.started = false
    this.round = { currentQuestion: 0, playersAnswers: [], startTime: 0, displayOrder: null }
    this.leaderboard = []
    this.tempOldLeaderboard = null

    this.players = this.players.map((p) => ({
      ...p,
      points: 0,
      streak: 0,
      lastCorrect: undefined,
      lastPoints: undefined,
      lastBonus: undefined,
      lastStreak: undefined,
    }))
    this.listener.onPlayers([...this.players])
    this.listener.onPoints(0)
    this.bus.emit(EVENTS.GAME_TOTAL_PLAYERS, this.players.length)

    this.sendLobbyStatuses()
    this.maybeAutopilot()
  }
}
