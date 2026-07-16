import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EVENTS } from '@bazoot/shared/events'
import { registerConnectionHandlers } from '../src/events/registerConnectionHandlers.js'

class FakeSocket {
  constructor({ socketId = 'socket-1' } = {}) {
    this.id = socketId
    this.handlers = new Map()
  }

  on(event, handler) {
    this.handlers.set(event, handler)
  }

  async trigger(event) {
    await this.handlers.get(event)()
  }
}

describe('connection socket handlers', () => {
  it('does not rebroadcast or notify the engine for an already-disconnected player', async () => {
    const socket = new FakeSocket({ socketId: 'p1' })
    const broadcasts = []
    const room = {
      gameId: 'game-1',
      inviteCode: '123456',
      manager: { id: 'manager-1', connected: true },
      players: [{ id: 'p1', clientId: 'alice', connected: false, username: 'Alice' }],
      engine: { started: true },
    }
    const roomManager = {
      getRoomByManagerSocketId() {
        return undefined
      },
      getRoomByPlayerSocketId(socketId) {
        return socketId === 'p1' ? room : undefined
      },
      markPlayerDisconnected() {
        return undefined
      },
    }
    const bus = {
      broadcast(gameId, event, payload) {
        broadcasts.push({ gameId, event, payload })
      },
    }

    registerConnectionHandlers({ io: {}, socket, roomManager, bus })

    await socket.trigger('disconnect')

    assert.equal(broadcasts.some((event) => event.event === EVENTS.GAME_TOTAL_PLAYERS), false)
  })
})
