import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EVENTS } from '@bazoot/shared/events'
import { RuntimeSettings } from '../src/config/RuntimeSettings.js'
import { createDatabase } from '../src/db/createDatabase.js'
import { registerAdminHandlers } from '../src/events/registerAdminHandlers.js'

const env = {
  port: 3001,
  allowRegistration: false,
  emailVerification: 'auto',
  smtpHost: '',
  mailProvider: 'auto',
  maxPlayersPerRoom: 50,
  questionTimeLimit: 20,
  scoreMax: 1000,
  sessionTtlMs: 180 * 24 * 60 * 60 * 1000,
}

class FakeSocket {
  constructor() {
    this.data = { isManager: true, managerUsername: 'root' }
    this.handlers = new Map()
    this.emitted = []
  }

  on(event, handler) {
    this.handlers.set(event, handler)
  }

  emit(event, payload) {
    this.emitted.push({ event, payload })
  }

  async trigger(event, payload) {
    await this.handlers.get(event)(payload)
  }

  last(event) {
    return [...this.emitted].reverse().find((emitted) => emitted.event === event)?.payload
  }
}

const makeHarness = ({ superAdmin = true } = {}) => {
  const socket = new FakeSocket()
  const db = createDatabase(':memory:')
  const runtimeSettings = new RuntimeSettings({ db, defaults: env })
  const accountService = {
    allowRegistration: false,
    isSuperAdmin: async () => superAdmin,
    setAllowRegistration(value) {
      this.allowRegistration = value
    },
  }
  const roomManager = {
    maxPlayersPerRoom: 50,
    store: new Map(),
    setMaxPlayersPerRoom(value) {
      this.maxPlayersPerRoom = value
    },
  }

  registerAdminHandlers({
    socket,
    roomManager,
    accountService,
    questionProvider: { listQuizzes: async () => [] },
    env,
    runtimeSettings,
  })

  return { socket, accountService, roomManager, runtimeSettings }
}

describe('admin runtime settings', () => {
  it('rejects updates from non-super-admin managers', async () => {
    const { socket, runtimeSettings } = makeHarness({ superAdmin: false })

    await socket.trigger(EVENTS.ADMIN_UPDATE_SERVER_SETTINGS, { allowRegistration: true })

    assert.match(socket.last(EVENTS.GAME_ERROR_MESSAGE), /super admin/i)
    assert.equal(runtimeSettings.snapshot().allowRegistration, false)
  })

  it('updates editable settings and emits the refreshed server config', async () => {
    const { socket, accountService, roomManager, runtimeSettings } = makeHarness()

    await socket.trigger(EVENTS.ADMIN_UPDATE_SERVER_SETTINGS, {
      allowRegistration: true,
      maxPlayersPerRoom: 80,
      questionTimeLimit: 45,
      scoreMax: 3000,
    })

    assert.deepEqual(runtimeSettings.snapshot(), {
      allowRegistration: true,
      maxPlayersPerRoom: 80,
      questionTimeLimit: 45,
      scoreMax: 3000,
    })
    assert.equal(accountService.allowRegistration, true)
    assert.equal(roomManager.maxPlayersPerRoom, 80)
    assert.equal(socket.last(EVENTS.ADMIN_SERVER_CONFIG).allowRegistration, true)
    assert.equal(socket.last(EVENTS.ADMIN_SERVER_CONFIG).maxPlayersPerRoom, 80)
  })

  it('rejects read-only infrastructure keys', async () => {
    const { socket, runtimeSettings } = makeHarness()

    await socket.trigger(EVENTS.ADMIN_UPDATE_SERVER_SETTINGS, { port: 4000 })

    assert.match(socket.last(EVENTS.GAME_ERROR_MESSAGE), /Unknown runtime setting/)
    assert.equal(runtimeSettings.snapshot().maxPlayersPerRoom, 50)
  })
})
