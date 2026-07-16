import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { EVENTS } from '@bazoot/shared/events'
import { RuntimeSettings } from '../src/config/RuntimeSettings.js'
import { createDatabase } from '../src/db/createDatabase.js'
import { registerManagerHandlers } from '../src/events/registerManagerHandlers.js'
import { GameEventBus } from '../src/game/GameEventBus.js'
import { MemoryRoomStore } from '../src/rooms/MemoryRoomStore.js'
import { RoomManager } from '../src/rooms/RoomManager.js'

const managers = []

class FakeSocket {
  constructor() {
    this.id = 'manager-socket'
    this.handshake = { auth: { clientId: 'manager-client' }, headers: {}, address: '127.0.0.1' }
    this.data = {
      isManager: true,
      managerUsername: 'admin',
      organizationId: 'workspace-1',
    }
    this.handlers = new Map()
    this.emitted = []
    this.rooms = new Set()
  }

  on(event, handler) {
    this.handlers.set(event, handler)
  }

  emit(event, payload) {
    this.emitted.push({ event, payload })
  }

  join(room) {
    this.rooms.add(room)
  }

  async trigger(event, payload) {
    await this.handlers.get(event)(payload)
  }
}

afterEach(() => {
  while (managers.length) {
    managers.pop().shutdown()
  }
})

describe('manager game creation runtime settings', () => {
  it('uses the latest question time and score settings for new games', async () => {
    const db = createDatabase(':memory:')
    const runtimeSettings = new RuntimeSettings({
      db,
      defaults: {
        allowRegistration: false,
        maxPlayersPerRoom: 50,
        questionTimeLimit: 20,
        scoreMax: 1000,
      },
    })
    runtimeSettings.update({ questionTimeLimit: 45, scoreMax: 2500 })

    const bus = new GameEventBus()
    const roomManager = new RoomManager({
      store: new MemoryRoomStore(),
      bus,
      sweepIntervalMs: 3_600_000,
    })
    managers.push(roomManager)

    const socket = new FakeSocket()
    registerManagerHandlers({
      io: {},
      socket,
      roomManager,
      questionProvider: {
        getQuestions: async () => ({
          subject: 'Runtime quiz',
          questions: [{ question: 'Q?', answers: ['A', 'B'], solution: 0, cooldown: 5, time: 20 }],
        }),
      },
      accountService: {},
      bus,
      env: {},
      runtimeSettings,
    })

    await socket.trigger(EVENTS.GAME_CREATE, 'quiz-1')

    const [room] = [...roomManager.store.values()]
    assert.equal(room.engine.defaultQuestionTime, 45)
    assert.equal(room.engine.scoreMax, 2500)
  })

  it('does not create duplicate active rooms for one manager socket', async () => {
    const runtimeSettings = new RuntimeSettings({
      db: createDatabase(':memory:'),
      defaults: {
        allowRegistration: false,
        maxPlayersPerRoom: 50,
        questionTimeLimit: 20,
        scoreMax: 1000,
      },
    })
    const bus = new GameEventBus()
    const roomManager = new RoomManager({
      store: new MemoryRoomStore(),
      bus,
      sweepIntervalMs: 3_600_000,
    })
    managers.push(roomManager)

    const socket = new FakeSocket()
    registerManagerHandlers({
      io: {},
      socket,
      roomManager,
      questionProvider: {
        getQuestions: async () => ({
          subject: 'Runtime quiz',
          questions: [{ question: 'Q?', answers: ['A', 'B'], solution: 0, cooldown: 5, time: 20 }],
        }),
      },
      accountService: {},
      bus,
      env: {},
      runtimeSettings,
    })

    await socket.trigger(EVENTS.GAME_CREATE, 'quiz-1')
    await socket.trigger(EVENTS.GAME_CREATE, 'quiz-1')

    assert.equal([...roomManager.store.values()].length, 1)
    assert.equal(
      socket.emitted.filter((emitted) => emitted.event === EVENTS.MANAGER_GAME_CREATED).length,
      1,
    )
    assert.equal(socket.emitted.at(-1).event, EVENTS.MANAGER_ERROR_MESSAGE)
    assert.equal(socket.emitted.at(-1).payload, 'Manager already has an active game')
  })
})
