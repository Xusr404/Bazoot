import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { EVENTS } from '@bazoot/shared/events'
import { ENGINE_STATE, STATUS } from '@bazoot/shared/gameStates'
import { GameEngine } from '../src/game/GameEngine.js'
import { BUS, GameEventBus } from '../src/game/GameEventBus.js'

const defaultQuizz = {
  id: 'unit',
  subject: 'Unit Quiz',
  questions: [
    { question: 'Q1', answers: ['A', 'B', 'C', 'D'], solution: 1, cooldown: 1, time: 10 },
    { question: 'Q2', answers: ['A', 'B'], solution: 0, cooldown: 1, time: 10 },
  ],
}

// Engine harness with a recording bus; tests drive the synchronous methods
// directly (timer-driven flow is covered by server/test-flow.js).
const makeEngine = ({ quizz = defaultQuizz, playerCount = 2, answerCountBroadcastMs = 0 } = {}) => {
  const bus = new GameEventBus()
  const sent = [] // SEND_TO  { targetId, event, payload }
  const broadcasts = [] // BROADCAST { gameId, event, payload, exceptId }
  const roomChanges = []
  bus.on(BUS.SEND_TO, (message) => sent.push(message))
  bus.on(BUS.BROADCAST, (message) => broadcasts.push(message))

  const room = {
    gameId: 'game-1',
    inviteCode: '111111',
    manager: { id: 'mgr-socket', clientId: 'mgr-client', connected: true },
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      clientId: `c${i + 1}`,
      connected: true,
      username: `Player${i + 1}`,
      points: 0,
    })),
    engine: null,
  }

  const engine = new GameEngine({
    room,
    quizz,
    bus,
    answerCountBroadcastMs,
    onRoomChanged: (changedRoom) => {
      roomChanges.push({
        players: changedRoom.players.map((player) => ({ ...player })),
      })
    },
  })
  room.engine = engine

  // Helper: put the engine straight into ANSWERING for the current question.
  const enterAnswering = () => {
    engine.started = true
    engine.state = ENGINE_STATE.ANSWERING
    engine.round.startTime = Date.now()
  }

  const statusesSentTo = (targetId) =>
    sent.filter((m) => m.targetId === targetId && m.event === EVENTS.GAME_STATUS).map((m) => m.payload)

  return { engine, room, bus, sent, broadcasts, roomChanges, enterAnswering, statusesSentTo }
}

describe('receiveAnswer', () => {
  it('ignores answers outside the ANSWERING state', () => {
    const { engine } = makeEngine()
    engine.receiveAnswer('p1', 1)
    assert.equal(engine.round.playersAnswers.length, 0)
  })

  it('records one valid answer per player, ignores duplicates/unknowns/garbage', () => {
    const { engine, enterAnswering } = makeEngine()
    enterAnswering()

    engine.receiveAnswer('p1', 1)
    engine.receiveAnswer('p1', 2) // duplicate
    engine.receiveAnswer('ghost', 1) // unknown player
    engine.receiveAnswer('p2', 99) // out of range
    engine.receiveAnswer('p2', [1]) // wrong shape for single

    assert.equal(engine.round.playersAnswers.length, 1)
    assert.equal(engine.round.playersAnswers[0].playerId, 'p1')
    assert.equal(engine.round.playersAnswers[0].answerId, 1)
    assert.ok(engine.round.playersAnswers[0].points > 900) // instant answer ≈ scoreMax
  })

  it('sends WAIT to the answering player and notifies the rest', () => {
    const { engine, enterAnswering, statusesSentTo, broadcasts } = makeEngine()
    enterAnswering()
    engine.receiveAnswer('p1', 0)

    const waits = statusesSentTo('p1')
    assert.equal(waits.length, 1)
    assert.equal(waits[0].name, STATUS.WAIT)

    const answerBroadcast = broadcasts.find((b) => b.event === EVENTS.GAME_PLAYER_ANSWER)
    assert.equal(answerBroadcast.payload, 1)
    assert.equal(answerBroadcast.exceptId, undefined)
    assert.equal(broadcasts.some((b) => b.event === EVENTS.GAME_TOTAL_PLAYERS), false)
  })

  it('coalesces rapid answer count broadcasts', async () => {
    const { engine, enterAnswering, broadcasts } = makeEngine({
      playerCount: 4,
      answerCountBroadcastMs: 25,
    })
    enterAnswering()
    engine.countdown.active = true

    engine.receiveAnswer('p1', 1)
    engine.receiveAnswer('p2', 0)
    engine.receiveAnswer('p3', 1)

    assert.equal(broadcasts.some((b) => b.event === EVENTS.GAME_PLAYER_ANSWER), false)

    await delay(40)

    const answerBroadcasts = broadcasts.filter((b) => b.event === EVENTS.GAME_PLAYER_ANSWER)
    assert.equal(answerBroadcasts.length, 1)
    assert.equal(answerBroadcasts[0].payload, 3)
  })

  it('ends the countdown when all connected players answered', () => {
    const { engine, enterAnswering } = makeEngine()
    enterAnswering()
    engine.countdown.active = true

    engine.receiveAnswer('p1', 1)
    assert.equal(engine.countdown.active, true)

    engine.receiveAnswer('p2', 0)
    assert.equal(engine.countdown.active, false)
  })

  it('clears the countdown timer immediately when every player has answered', async () => {
    const { engine, enterAnswering } = makeEngine()
    enterAnswering()
    const countdownFinished = engine.startCountdown(10)

    engine.receiveAnswer('p1', 1)
    engine.receiveAnswer('p2', 0)

    assert.equal(engine.countdown.active, false)
    assert.equal(engine.countdown.interval, null)
    await countdownFinished
  })

  it('does not wait for disconnected players', () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()
    engine.countdown.active = true

    engine.receiveAnswer('p1', 1)
    assert.equal(engine.countdown.active, true)

    room.players[1].connected = false
    engine.checkAllAnswered('p2')
    assert.equal(engine.countdown.active, false)
  })

  it('does not finish early when an already-answered player disconnects', () => {
    const { engine, room, enterAnswering } = makeEngine({ playerCount: 3 })
    enterAnswering()
    engine.countdown.active = true

    engine.receiveAnswer('p1', 1)
    room.players[0].connected = false
    engine.checkAllAnswered('p1')
    engine.receiveAnswer('p2', 0)

    assert.equal(engine.countdown.active, true)

    engine.receiveAnswer('p3', 1)
    assert.equal(engine.countdown.active, false)
  })

  it('does not keep a countdown alive when no connected players can answer', async () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()
    room.players.forEach((player) => {
      player.connected = false
    })
    engine.prepareAnsweringRound()

    const countdownFinished = engine.startCountdown(10)
    engine.checkAllAnswered()

    assert.equal(engine.round.answerablePlayerIds.size, 0)
    assert.equal(engine.countdown.active, false)
    assert.equal(engine.countdown.interval, null)
    await countdownFinished
  })

  it('does not wait for a kicked unanswered player', () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()
    engine.countdown.active = true

    engine.receiveAnswer('p1', 1)
    assert.equal(engine.countdown.active, true)

    room.players = room.players.filter((player) => player.id !== 'p2')
    engine.removePlayerStatus('p2')

    assert.equal(engine.countdown.active, false)
    assert.equal(engine.round.answerablePlayerIds.has('p2'), false)
  })

  it('keeps answer tracking stable when a player reconnects mid-round', () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()

    engine.receiveAnswer('p1', 1)
    engine.takePlayerStatus('p1', 'p1-new')
    room.players[0].id = 'p1-new'

    engine.receiveAnswer('p1-new', 0)

    assert.equal(engine.round.playersAnswers.length, 1)
    assert.equal(engine.round.playersAnswers[0].playerId, 'p1-new')
    assert.equal(engine.round.playerAnswersById.has('p1'), false)
    assert.equal(engine.round.playerAnswersById.has('p1-new'), true)
  })

  it('keeps unanswered tracking stable when a player reconnects mid-round', () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()
    engine.countdown.active = true
    engine.receiveAnswer('p1', 1)

    engine.takePlayerStatus('p2', 'p2-new')
    room.players[1].id = 'p2-new'

    assert.equal(engine.round.remainingAnswerablePlayerIds.has('p2'), false)
    assert.equal(engine.round.remainingAnswerablePlayerIds.has('p2-new'), true)

    engine.receiveAnswer('p2-new', 0)
    assert.equal(engine.countdown.active, false)
  })

  it('lets an unanswered disconnected player answer after reconnecting while the countdown is active', () => {
    const { engine, room, enterAnswering } = makeEngine({ playerCount: 3 })
    enterAnswering()
    engine.countdown.active = true
    engine.receiveAnswer('p1', 1)

    room.players[1].connected = false
    engine.checkAllAnswered('p2')

    assert.equal(engine.round.answerablePlayerIds.has('p2'), false)
    assert.equal(engine.countdown.active, true)

    room.players[1].id = 'p2-new'
    room.players[1].connected = true
    engine.takePlayerStatus('p2', 'p2-new')

    assert.equal(engine.round.answerablePlayerIds.has('p2-new'), true)
    assert.equal(engine.round.remainingAnswerablePlayerIds.has('p2-new'), true)

    engine.receiveAnswer('p3', 0)
    assert.equal(engine.countdown.active, true)

    engine.receiveAnswer('p2-new', 1)
    assert.equal(engine.countdown.active, false)
  })

  it('does not reopen a closed answering round when an unanswered player reconnects', () => {
    const { engine, room, enterAnswering } = makeEngine()
    enterAnswering()
    engine.countdown.active = true
    engine.receiveAnswer('p1', 1)

    room.players[1].connected = false
    engine.checkAllAnswered('p2')
    assert.equal(engine.countdown.active, false)

    room.players[1].id = 'p2-new'
    room.players[1].connected = true
    engine.takePlayerStatus('p2', 'p2-new')
    engine.receiveAnswer('p2-new', 1)

    assert.equal(engine.round.answerablePlayerIds.has('p2-new'), false)
    assert.equal(engine.round.playersAnswers.length, 1)
  })
})

describe('reveal', () => {
  it('awards rounded time-bonus points only for correct answers and ranks players', () => {
    const { engine, room, enterAnswering, statusesSentTo, sent, roomChanges } = makeEngine()
    enterAnswering()
    engine.receiveAnswer('p1', 1) // correct
    engine.receiveAnswer('p2', 0) // wrong

    engine.reveal(engine.currentQuestion)

    assert.equal(engine.state, ENGINE_STATE.REVEAL)
    assert.equal(room.players[0].username, 'Player1') // sorted: correct answer first
    assert.ok(room.players[0].points > 0)
    assert.equal(room.players[1].points, 0)
    assert.equal(roomChanges.some((change) => change.players[0].points > 0), true)

    const p1Result = statusesSentTo('p1').find((s) => s.name === STATUS.SHOW_RESULT)
    assert.equal(p1Result.data.correct, true)
    assert.equal(p1Result.data.rank, 1)
    assert.equal(p1Result.data.aheadOfMe, null)
    assert.equal(p1Result.data.message, 'Nice!')

    const p2Result = statusesSentTo('p2').find((s) => s.name === STATUS.SHOW_RESULT)
    assert.equal(p2Result.data.correct, false)
    assert.equal(p2Result.data.rank, 2)
    assert.equal(p2Result.data.aheadOfMe, 'Player1')

    const managerReveal = sent.find(
      (m) => m.targetId === 'mgr-socket' && m.payload?.name === STATUS.SHOW_RESPONSES,
    )
    assert.deepEqual(managerReveal.payload.data.responses, { 0: 1, 1: 1 })
    assert.equal(managerReveal.payload.data.correct, 1)
    assert.equal(engine.round.playersAnswers.length, 0)
  })

  it('handles multi questions end to end (exact set required)', () => {
    const multiQuizz = {
      ...defaultQuizz,
      questions: [
        { type: 'multi', question: 'M', answers: ['A', 'B', 'C', 'D'], solution: [0, 2], cooldown: 1, time: 10 },
      ],
    }
    const { engine, room, enterAnswering } = makeEngine({ quizz: multiQuizz })
    enterAnswering()

    engine.receiveAnswer('p1', [2, 0]) // correct, order irrelevant
    engine.receiveAnswer('p2', [0, 2, 3]) // superset → wrong
    engine.reveal(engine.currentQuestion)

    const p1 = room.players.find((p) => p.id === 'p1')
    const p2 = room.players.find((p) => p.id === 'p2')
    assert.ok(p1.points > 0)
    assert.equal(p2.points, 0)
  })

  it('handles order questions via the display shuffle', () => {
    const orderQuizz = {
      ...defaultQuizz,
      questions: [
        { type: 'order', question: 'O', answers: ['1st', '2nd', '3rd'], cooldown: 1, time: 10 },
      ],
    }
    const { engine, room, enterAnswering, sent } = makeEngine({ quizz: orderQuizz })
    enterAnswering()
    engine.round.displayOrder = [2, 0, 1] // displayed 0 = original 2, …

    // Correct: original 0 is displayed at 1, original 1 at 2, original 2 at 0.
    engine.receiveAnswer('p1', [1, 2, 0])
    engine.receiveAnswer('p2', [0, 1, 2])
    engine.reveal(engine.currentQuestion)

    assert.ok(room.players.find((p) => p.id === 'p1').points > 0)
    assert.equal(room.players.find((p) => p.id === 'p2').points, 0)

    const managerReveal = sent.find(
      (m) => m.targetId === 'mgr-socket' && m.payload?.name === STATUS.SHOW_RESPONSES,
    )
    assert.deepEqual(managerReveal.payload.data.correct, [1, 2, 0])
    assert.deepEqual(managerReveal.payload.data.answers, ['3rd', '1st', '2nd'])
  })
})

describe('answer streaks', () => {
  it('grows the bonus across consecutive correct answers and reports it', () => {
    const { engine, room, enterAnswering, statusesSentTo } = makeEngine()

    // Round 1 (Q1, solution 1): p1 correct, p2 wrong.
    enterAnswering()
    engine.receiveAnswer('p1', 1)
    engine.receiveAnswer('p2', 0)
    engine.reveal(engine.currentQuestion)

    const p1 = () => room.players.find((p) => p.id === 'p1')
    const p2 = () => room.players.find((p) => p.id === 'p2')
    assert.equal(p1().streak, 1)
    assert.equal(p2().streak, 0)

    const r1 = statusesSentTo('p1').find((s) => s.name === STATUS.SHOW_RESULT)
    assert.equal(r1.data.streak, 1)
    assert.equal(r1.data.streakBonus, 0) // first correct → no bonus yet

    // Round 2 (Q2, solution 0): p1 correct again → streak 2, bonus applied.
    engine.round.currentQuestion = 1
    enterAnswering()
    engine.receiveAnswer('p1', 0)
    engine.reveal(engine.currentQuestion)

    assert.equal(p1().streak, 2)
    const r2 = statusesSentTo('p1').find(
      (s) => s.name === STATUS.SHOW_RESULT && s.data.streak === 2,
    )
    assert.ok(r2)
    assert.ok(r2.data.streakBonus > 0)
    assert.ok(r2.data.points > r2.data.streakBonus) // total = base + bonus
  })

  it('resets a player streak after a wrong answer', () => {
    const { engine, room, enterAnswering } = makeEngine()

    enterAnswering()
    engine.receiveAnswer('p1', 1) // correct
    engine.reveal(engine.currentQuestion)
    assert.equal(room.players.find((p) => p.id === 'p1').streak, 1)

    engine.round.currentQuestion = 1
    enterAnswering()
    engine.receiveAnswer('p1', 1) // Q2 solution is 0 → wrong
    engine.reveal(engine.currentQuestion)
    assert.equal(room.players.find((p) => p.id === 'p1').streak, 0)
  })
})

describe('showLeaderboard', () => {
  it('ignores stale leaderboard requests outside the reveal phase', () => {
    const { engine, sent, broadcasts } = makeEngine()

    engine.started = true
    engine.state = ENGINE_STATE.ANSWERING
    engine.showLeaderboard()

    assert.equal(engine.state, ENGINE_STATE.ANSWERING)
    assert.equal(
      sent.some((m) => m.payload?.name === STATUS.SHOW_LEADERBOARD),
      false,
    )
    assert.equal(
      broadcasts.some((b) => b.event === EVENTS.GAME_STATUS && b.payload?.name === STATUS.FINISHED),
      false,
    )
  })

  it('sends the manager top-5 with the previous board for the count-up', () => {
    const { engine, enterAnswering, sent } = makeEngine()
    enterAnswering()
    engine.receiveAnswer('p1', 1)
    engine.reveal(engine.currentQuestion)

    engine.showLeaderboard()

    assert.equal(engine.state, ENGINE_STATE.LEADERBOARD)
    const board = sent.find(
      (m) => m.targetId === 'mgr-socket' && m.payload?.name === STATUS.SHOW_LEADERBOARD,
    )
    assert.equal(board.payload.data.leaderboard[0].username, 'Player1')
    assert.ok(board.payload.data.oldLeaderboard.every((p) => p.points === 0))
  })

  it('broadcasts FINISHED with the top 3 after the last question', () => {
    const { engine, enterAnswering, broadcasts } = makeEngine()
    engine.round.currentQuestion = 1 // last question
    enterAnswering()
    engine.receiveAnswer('p1', 0)
    engine.reveal(engine.currentQuestion)

    engine.showLeaderboard()

    assert.equal(engine.state, ENGINE_STATE.END)
    assert.equal(engine.started, false)
    const finished = broadcasts.find(
      (b) => b.event === EVENTS.GAME_STATUS && b.payload.name === STATUS.FINISHED,
    )
    assert.equal(finished.payload.data.top.length, 2)
    assert.equal(finished.payload.data.subject, 'Unit Quiz')
  })
})

describe('manager round controls', () => {
  it('ignores stale async round continuations from an older run', async () => {
    const { engine, sent, broadcasts } = makeEngine()

    engine.started = true
    engine.runId = 2
    engine.state = ENGINE_STATE.LEADERBOARD

    await engine.newRound(1)

    assert.equal(engine.state, ENGINE_STATE.LEADERBOARD)
    assert.equal(sent.length, 0)
    assert.equal(broadcasts.length, 0)
  })

  it('advances to the next question only once from the leaderboard phase', () => {
    const quizz = {
      ...defaultQuizz,
      questions: [
        ...defaultQuizz.questions,
        { question: 'Q3', answers: ['A', 'B'], solution: 0, cooldown: 1, time: 10 },
      ],
    }
    const { engine } = makeEngine({ quizz })
    let newRoundCalls = 0
    engine.newRound = () => {
      newRoundCalls += 1
      engine.state = ENGINE_STATE.PREPARED
    }

    engine.started = true
    engine.state = ENGINE_STATE.REVEAL
    engine.nextQuestion()
    assert.equal(engine.round.currentQuestion, 0)
    assert.equal(newRoundCalls, 0)

    engine.state = ENGINE_STATE.LEADERBOARD
    engine.nextQuestion()
    engine.nextQuestion()

    assert.equal(engine.round.currentQuestion, 1)
    assert.equal(newRoundCalls, 1)
  })

  it('aborts countdowns only while answering', () => {
    const { engine } = makeEngine()
    engine.started = true
    engine.countdown.active = true
    engine.state = ENGINE_STATE.PREPARED

    engine.abortRound()
    assert.equal(engine.countdown.active, true)

    engine.state = ENGINE_STATE.ANSWERING
    engine.abortRound()
    assert.equal(engine.countdown.active, false)
  })
})

describe('resetGame (Play Again)', () => {
  const finishGame = (harness) => {
    harness.engine.round.currentQuestion = 1
    harness.enterAnswering()
    harness.engine.receiveAnswer('p1', 0)
    harness.engine.reveal(harness.engine.currentQuestion)
    harness.engine.showLeaderboard()
  }

  it('only works from END', () => {
    const { engine } = makeEngine()
    engine.resetGame()
    assert.equal(engine.state, ENGINE_STATE.LOBBY) // unchanged initial state
    engine.state = ENGINE_STATE.ANSWERING
    engine.resetGame()
    assert.equal(engine.state, ENGINE_STATE.ANSWERING)
  })

  it('returns to the lobby with scores reset and leavers dropped', () => {
    const harness = makeEngine()
    const { engine, room, sent, roomChanges } = harness
    finishGame(harness)
    room.players.find((p) => p.id === 'p2').connected = false

    engine.resetGame()

    assert.equal(engine.state, ENGINE_STATE.LOBBY)
    assert.equal(engine.started, false)
    assert.equal(engine.round.currentQuestion, 0)
    assert.equal(room.players.length, 1)
    assert.equal(room.players[0].points, 0)
    assert.equal(room.players[0].streak, 0)
    assert.equal(engine.leaderboard.length, 0)
    assert.equal(engine.lastBroadcastStatus, null)
    assert.equal(
      roomChanges.some((change) =>
        change.players.length === 1 && change.players[0].points === 0 && change.players[0].streak === 0,
      ),
      true,
    )

    const managerRoom = sent.filter(
      (m) => m.targetId === 'mgr-socket' && m.payload?.name === STATUS.SHOW_ROOM,
    )
    assert.equal(managerRoom.length, 1)
    assert.equal(managerRoom[0].payload.data.inviteCode, '111111')
    assert.equal(managerRoom[0].payload.data.players.length, 1)

    const p1Wait = sent.find((m) => m.targetId === 'p1' && m.payload?.name === STATUS.WAIT)
    assert.ok(p1Wait)
    const pointsReset = sent.find((m) => m.targetId === 'p1' && m.event === EVENTS.PLAYER_UPDATE_POINTS)
    assert.equal(pointsReset.payload, 0)
  })
})
