import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { correctAnswerKey, planBotAnswer, wrongAnswerKey } from '../src/demo/bots.js'
import { createDemoBus } from '../src/demo/demoBus.js'
import { DEMO_PLAYER_ID, DemoEngine } from '../src/demo/DemoEngine.js'

const QUIZZ = {
  subject: 'Demo quiz',
  questions: [
    { type: 'single', question: 'Q1', answers: ['A', 'B'], solution: 1, cooldown: 1, time: 3 },
    { type: 'single', question: 'Q2', answers: ['C', 'D'], solution: 0, cooldown: 1, time: 3 },
  ],
}

// Engine timers run 500× faster than real time: 1 game-second = 2 ms.
const MS_PER_SECOND = 2

const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now()

  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out')
    }

    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const createHarness = ({ rng = () => 0 } = {}) => {
  const bus = createDemoBus()
  const seen = {
    managerStatuses: [],
    youStatuses: [],
    players: [],
    points: [],
    busEvents: [],
  }

  for (const event of Object.values(EVENTS)) {
    bus.on(event, (...args) => seen.busEvents.push([event, ...args]))
  }

  const engine = new DemoEngine({
    quizz: QUIZZ,
    bus,
    msPerSecond: MS_PER_SECOND,
    rng,
    listener: {
      onManagerStatus: (status) => seen.managerStatuses.push(status),
      onPlayerStatus: (status) => seen.youStatuses.push(status),
      onPlayers: (players) => {
        seen.players = players
      },
      onPoints: (points) => seen.points.push(points),
      onProgress: () => {},
    },
  })

  const lastManager = () => seen.managerStatuses.at(-1)
  const lastYou = () => seen.youStatuses.at(-1)

  return { engine, seen, lastManager, lastYou }
}

describe('bot answers', () => {
  const single = { type: 'single', answers: ['A', 'B', 'C'], solution: 1 }
  const multi = { type: 'multi', answers: ['A', 'B', 'C'], solution: [0, 2] }
  const order = { type: 'order', answers: ['1st', '2nd', '3rd'] }
  const orderDisplay = [2, 0, 1] // displayed index → original index

  it('correctAnswerKey matches each type', () => {
    assert.equal(correctAnswerKey(single, null), 1)
    assert.deepEqual(correctAnswerKey(multi, null), [0, 2])
    // original order 0,1,2 shown at displayed positions 1,2,0
    assert.deepEqual(correctAnswerKey(order, orderDisplay), [1, 2, 0])
  })

  it('wrongAnswerKey is always a valid but different payload', () => {
    for (let i = 0; i < 25; i += 1) {
      assert.notEqual(wrongAnswerKey(single, null), single.solution)
      assert.notDeepEqual(wrongAnswerKey(multi, null), multi.solution)
      assert.notDeepEqual(wrongAnswerKey(order, orderDisplay), [1, 2, 0])
    }
  })

  it('planBotAnswer follows the accuracy roll', () => {
    assert.equal(planBotAnswer(single, null, 0.9, () => 0.5), 1)
    assert.notEqual(planBotAnswer(single, null, 0.1, () => 0.5), 1)
  })
})

describe('DemoEngine', () => {
  it('opens a lobby where You joins instantly and bots trickle in', async () => {
    const { engine, seen, lastManager } = createHarness()
    engine.begin()

    assert.equal(seen.players.length, 1)
    assert.equal(seen.players[0].id, DEMO_PLAYER_ID)
    assert.equal(lastManager().name, STATUS.SHOW_ROOM)

    await waitFor(() => seen.players.length === 4)
    assert.equal(lastManager().data.players.length, 4)
    assert.equal(engine.kickPlayer(DEMO_PLAYER_ID), false)
    assert.equal(engine.kickPlayer(seen.players[1].id), true)
    assert.equal(seen.players.length, 3)

    engine.destroy()
  })

  it('plays a full host-driven game with the real status sequence', async () => {
    // rng 0.2: bots answer correctly (accuracy ≥ 0.35) at ~29% of the limit.
    const { engine, seen, lastManager, lastYou } = createHarness({ rng: () => 0.2 })
    engine.begin()
    await waitFor(() => seen.players.length === 4)

    engine.advance(EVENTS.MANAGER_START_GAME)
    await waitFor(() => lastManager().name === STATUS.SELECT_ANSWER)

    // "You" answers correctly; bots follow; the round reveals early.
    engine.receiveAnswer(DEMO_PLAYER_ID, 1)
    assert.equal(lastYou().name, STATUS.WAIT)

    await waitFor(() => lastManager().name === STATUS.SHOW_RESPONSES)
    assert.equal(lastYou().name, STATUS.SHOW_RESULT)
    assert.equal(lastYou().data.correct, true)
    assert.ok(lastYou().data.myPoints > 0)
    assert.deepEqual(lastManager().data.correct, 1)

    // First correct answer → streak 1, no bonus yet.
    assert.equal(lastYou().data.streak, 1)
    assert.equal(lastYou().data.streakBonus, 0)

    engine.advance(EVENTS.MANAGER_SHOW_LEADERBOARD)
    assert.equal(lastManager().name, STATUS.SHOW_LEADERBOARD)

    engine.advance(EVENTS.MANAGER_NEXT_QUESTION)
    await waitFor(() => lastManager().name === STATUS.SELECT_ANSWER)

    // In the host view "You" answers automatically (accuracy roll 0.2 < 0.75).
    await waitFor(() => lastManager().name === STATUS.SHOW_RESPONSES)
    assert.equal(lastYou().data.correct, true)

    // Second correct in a row → streak 2 with a bonus folded into the points.
    assert.equal(lastYou().data.streak, 2)
    assert.ok(lastYou().data.streakBonus > 0)
    assert.ok(lastYou().data.points > lastYou().data.streakBonus)

    engine.advance(EVENTS.MANAGER_SHOW_LEADERBOARD)
    await waitFor(() => lastManager().name === STATUS.FINISHED)
    assert.equal(lastYou().name, STATUS.FINISHED)
    assert.ok(lastManager().data.top.length > 0)

    // Rematch resets scores and reopens the lobby with everyone still in.
    engine.advance(EVENTS.MANAGER_RESET_GAME)
    assert.equal(lastManager().name, STATUS.SHOW_ROOM)
    assert.equal(seen.players.every((p) => p.points === 0), true)
    assert.equal(seen.points.at(-1), 0)

    engine.destroy()
  })

  it('runs hands-free in the player view (host autopilot)', async () => {
    const { engine, seen, lastManager } = createHarness({ rng: () => 0.2 })
    engine.begin()
    engine.setViewRole('player')

    await waitFor(() => lastManager().name === STATUS.FINISHED, 5000)
    assert.ok(seen.players.some((p) => p.points > 0))

    engine.destroy()
  })

  it('destroy() silences all timers mid-game', async () => {
    const { engine, seen, lastManager } = createHarness()
    engine.begin()
    await waitFor(() => seen.players.length === 4)

    engine.advance(EVENTS.MANAGER_START_GAME)
    await waitFor(() => lastManager().name === STATUS.SHOW_START)
    engine.destroy()

    const statusCount = seen.managerStatuses.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(seen.managerStatuses.length, statusCount)
  })
})
