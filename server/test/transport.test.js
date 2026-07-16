import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUS, GameEventBus } from '../src/game/GameEventBus.js'
import { bindTransport } from '../src/events/transport.js'

const makeIo = () => {
  const calls = []
  const target = (selector) => ({
    emit(event, payload) {
      calls.push({ type: 'emit', selector, event, payload })
    },
    except(exceptId) {
      calls.push({ type: 'except', selector, exceptId })

      return {
        emit(event, payload) {
          calls.push({ type: 'emitExcept', selector, exceptId, event, payload })
        },
      }
    },
    socketsLeave(roomId) {
      calls.push({ type: 'socketsLeave', selector, roomId })
    },
  })

  return {
    calls,
    to: target,
    in: target,
  }
}

describe('transport binding', () => {
  it('makes all sockets leave a destroyed game room', () => {
    const bus = new GameEventBus()
    const io = makeIo()
    bindTransport(io, bus)

    bus.closeRoom('game-1')

    assert.deepEqual(io.calls, [
      { type: 'socketsLeave', selector: 'game-1', roomId: 'game-1' },
    ])
  })

  it('keeps targeted kicks scoped to the player socket', () => {
    const bus = new GameEventBus()
    const io = makeIo()
    bindTransport(io, bus)

    bus.emit(BUS.KICK, { gameId: 'game-1', playerId: 'player-1' })

    assert.deepEqual(io.calls, [
      { type: 'socketsLeave', selector: 'player-1', roomId: 'game-1' },
    ])
  })
})
