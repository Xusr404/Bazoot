import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RedisRoomStore } from '../src/rooms/RedisRoomStore.js'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const flushPromises = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setImmediate(resolve))
  }
}

class ControlledRedisClient {
  constructor() {
    this.setCalls = []
    this.delCalls = []
    this.publishCalls = []
  }

  set(key, value) {
    const wait = deferred()
    this.setCalls.push({ key, value, wait })

    return wait.promise
  }

  del(key) {
    const wait = deferred()
    this.delCalls.push({ key, wait })

    return wait.promise
  }

  publish(channel, message) {
    this.publishCalls.push({ channel, message })

    return Promise.resolve()
  }
}

describe('RedisRoomStore', () => {
  it('serializes Redis writes per room while keeping local state current', async () => {
    const redis = new ControlledRedisClient()
    const store = new RedisRoomStore({ pubClient: redis, subClient: redis })
    const firstRoom = {
      gameId: 'game-1',
      inviteCode: '111111',
      manager: { id: 'm1' },
      players: [{ id: 'p1', points: 0 }],
      engine: { local: true },
    }
    const secondRoom = {
      ...firstRoom,
      players: [{ id: 'p1', points: 10 }],
    }

    store.set(firstRoom.gameId, firstRoom)
    store.set(secondRoom.gameId, secondRoom)
    await flushPromises()

    assert.equal(store.get('game-1'), secondRoom)
    assert.equal(redis.setCalls.length, 1)

    redis.setCalls[0].wait.resolve()
    await flushPromises()

    assert.equal(redis.setCalls.length, 2)
    assert.deepEqual(JSON.parse(redis.setCalls[0].value).players[0].points, 0)
    assert.deepEqual(JSON.parse(redis.setCalls[1].value).players[0].points, 10)
    assert.equal(redis.publishCalls.length, 1)

    redis.setCalls[1].wait.resolve()
    await flushPromises()

    assert.equal(redis.publishCalls.length, 2)
    assert.equal(store.pendingWrites.size, 0)
  })

  it('orders deletes after earlier writes for the same room', async () => {
    const redis = new ControlledRedisClient()
    const store = new RedisRoomStore({ pubClient: redis, subClient: redis })
    const room = {
      gameId: 'game-1',
      inviteCode: '111111',
      manager: { id: 'm1' },
      players: [],
      engine: { local: true },
    }

    store.set(room.gameId, room)
    store.delete(room.gameId)
    await flushPromises()

    assert.equal(store.get('game-1'), undefined)
    assert.equal(redis.setCalls.length, 1)
    assert.equal(redis.delCalls.length, 0)

    redis.setCalls[0].wait.resolve()
    await flushPromises()

    assert.equal(redis.delCalls.length, 1)

    redis.delCalls[0].wait.resolve()
    await flushPromises()

    assert.equal(redis.publishCalls.map((call) => JSON.parse(call.message).action).join(','), 'set,delete')
    assert.equal(store.pendingWrites.size, 0)
  })
})
