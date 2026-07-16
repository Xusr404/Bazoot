import { RoomStore } from './RoomStore.js'

// Redis-backed room store (Phase 9B) for multi-server deployments.
//
// Design notes for going multi-server:
// - Only serialisable room state belongs in Redis (gameId, inviteCode, manager,
//   players, round/leaderboard snapshots). The live GameEngine (timers,
//   countdown promises) stays on the server that owns the room; `engine` is
//   re-attached from the local cache on every `get`.
// - socket.io needs its Redis adapter (@socket.io/redis-adapter) so broadcasts
//   reach players connected to other nodes.
export class RedisRoomStore extends RoomStore {
  constructor({ pubClient, subClient, keyPrefix = 'bazoot:room:' }) {
    super()
    this.pubClient = pubClient
    this.subClient = subClient
    this.keyPrefix = keyPrefix
    this.localEngines = new Map() // gameId → GameEngine (never serialised)
    this.localRooms = new Map() // local mirror so values() stays synchronous
    this.pendingWrites = new Map() // gameId → Promise chain for ordered Redis writes
  }

  get channelName() {
    return `${this.keyPrefix}updates`
  }

  async initialize() {
    // 1. Subscribe to updates from other nodes
    await this.subClient.subscribe(this.channelName, (message) => {
      try {
        const { action, gameId, room } = JSON.parse(message)
        
        if (action === 'set') {
          const localEngine = this.localEngines.get(gameId)
          this.localRooms.set(gameId, { ...room, engine: localEngine ?? null })
        } else if (action === 'delete') {
          this.localEngines.delete(gameId)
          this.localRooms.delete(gameId)
        }
      } catch (err) {
        console.error('Failed to parse Redis room update:', err)
      }
    })

    // 2. Fetch existing rooms to warm up local cache. SCAN avoids blocking Redis
    // on deployments that have many keys sharing the same database.
    const roomKeys = []

    for await (const key of this.pubClient.scanIterator({
      MATCH: `${this.keyPrefix}*`,
      COUNT: 100,
    })) {
      if (key !== this.channelName) {
        roomKeys.push(key)
      }
    }

    for (let i = 0; i < roomKeys.length; i += 100) {
      const data = await this.pubClient.mGet(roomKeys.slice(i, i + 100))

      data.forEach((json) => {
        if (!json) return
        try {
          const room = JSON.parse(json)
          this.localRooms.set(room.gameId, { ...room, engine: null })
        } catch (err) {
          console.error('Failed to parse Redis room warmup:', err)
        }
      })
    }
  }

  key(gameId) {
    return `${this.keyPrefix}${gameId}`
  }

  enqueueWrite(gameId, operation, label) {
    const previous = this.pendingWrites.get(gameId) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(operation)
      .catch((error) => console.error(`${label} failed:`, error))
      .finally(() => {
        if (this.pendingWrites.get(gameId) === next) {
          this.pendingWrites.delete(gameId)
        }
      })

    this.pendingWrites.set(gameId, next)
  }

  get(gameId) {
    return this.localRooms.get(gameId)
  }

  set(gameId, room) {
    const { engine, ...serialisable } = room

    if (engine) {
      this.localEngines.set(gameId, engine)
    }

    this.localRooms.set(gameId, room)

    const roomJson = JSON.stringify(serialisable)
    const updateJson = JSON.stringify({
      action: 'set',
      gameId,
      room: serialisable
    })

    this.enqueueWrite(gameId, () =>
      this.pubClient.set(this.key(gameId), roomJson)
        .then(() => {
          return this.pubClient.publish(this.channelName, updateJson)
        }),
      'Redis room replication',
    )
  }

  delete(gameId) {
    this.localEngines.delete(gameId)
    this.localRooms.delete(gameId)

    const updateJson = JSON.stringify({
      action: 'delete',
      gameId
    })

    this.enqueueWrite(gameId, () =>
      this.pubClient.del(this.key(gameId))
        .then(() => {
          return this.pubClient.publish(this.channelName, updateJson)
        }),
      'Redis room delete',
    )
  }

  values() {
    return this.localRooms.values()
  }

  async health() {
    const pubReady = this.pubClient?.isReady !== false
    const subReady = this.subClient?.isReady !== false

    return {
      status: pubReady && subReady ? 'ok' : 'degraded',
      type: 'redis',
      pubReady,
      subReady,
      pendingWrites: this.pendingWrites.size,
    }
  }

  async close() {
    await Promise.allSettled([...this.pendingWrites.values()])
    await Promise.allSettled([
      this.pubClient?.quit?.(),
      this.subClient?.quit?.(),
    ])
  }
}
