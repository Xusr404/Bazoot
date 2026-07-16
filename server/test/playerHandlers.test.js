import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EVENTS } from '@bazoot/shared/events'
import { registerPlayerHandlers } from '../src/events/registerPlayerHandlers.js'

class FakeSocket {
  constructor({ socketId = 'socket-1', clientId = 'client-1' } = {}) {
    this.id = socketId
    this.handshake = { auth: { clientId } }
    this.handlers = new Map()
    this.emitted = []
    this.joinedRooms = []
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

  join(roomId) {
    this.joinedRooms.push(roomId)
  }
}

const makeHarness = ({ started = false, withEngine = false } = {}) => {
  const room = {
    gameId: 'game-1',
    inviteCode: '123456',
    manager: { id: 'manager-1' },
    players: [],
    engine: withEngine || started ? { started } : null,
  }
  const socket = new FakeSocket()
  const busEvents = []
  const roomManager = {
    addPlayer(targetRoom, player) {
      targetRoom.players.push(player)
    },
    getRoom(gameId) {
      return gameId === room.gameId ? room : undefined
    },
    getRoomByInviteCode(inviteCode) {
      return inviteCode === room.inviteCode ? room : undefined
    },
    getPlayerRoom(gameId, clientId) {
      return gameId === room.gameId && room.players.some((player) => player.clientId === clientId)
        ? room
        : undefined
    },
    getPlayerByClientId(targetRoom, clientId) {
      return targetRoom.players.find((player) => player.clientId === clientId)
    },
    reconnectPlayer() {
      return undefined
    },
  }
  const bus = {
    sendTo(target, event, payload) {
      busEvents.push({ type: 'sendTo', target, event, payload })
    },
    broadcast(roomId, event, payload) {
      busEvents.push({ type: 'broadcast', roomId, event, payload })
    },
  }

  registerPlayerHandlers({ io: {}, socket, roomManager, bus })

  return { room, socket, busEvents }
}

describe('player socket handlers', () => {
  it('allows new player login while the room is still in the lobby', async () => {
    const { room, socket, busEvents } = makeHarness()

    await socket.trigger(EVENTS.PLAYER_LOGIN, {
      gameId: room.gameId,
      data: { username: 'AdaL' },
    })

    assert.equal(room.players.length, 1)
    assert.equal(room.players[0].clientId, 'client-1')
    assert.deepEqual(socket.joinedRooms, [room.gameId])
    assert.equal(socket.last(EVENTS.GAME_SUCCESS_JOIN), room.gameId)
    assert.equal(busEvents.find((event) => event.event === EVENTS.GAME_TOTAL_PLAYERS)?.payload, 1)
  })

  it('allows new player login after a rematch returns the engine to the lobby', async () => {
    const { room, socket } = makeHarness({ withEngine: true, started: false })

    await socket.trigger(EVENTS.PLAYER_LOGIN, {
      gameId: room.gameId,
      data: { username: 'Rematch Player' },
    })

    assert.equal(room.players.length, 1)
    assert.equal(socket.last(EVENTS.GAME_SUCCESS_JOIN), room.gameId)
  })

  it('rejects brand-new player login after the game has started', async () => {
    const { room, socket } = makeHarness({ started: true })

    await socket.trigger(EVENTS.PLAYER_LOGIN, {
      gameId: room.gameId,
      data: { username: 'Late Player' },
    })

    assert.equal(room.players.length, 0)
    assert.deepEqual(socket.joinedRooms, [])
    assert.equal(socket.last(EVENTS.GAME_ERROR_MESSAGE), 'Game already started')
    assert.equal(socket.last(EVENTS.GAME_SUCCESS_JOIN), undefined)
  })
})
