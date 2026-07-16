import { monitorEventLoopDelay } from 'node:perf_hooks'
import { EVENTS } from '@bazoot/shared/events'
import { BUS } from '../game/GameEventBus.js'

const bytesToMb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10

export class ServerMetrics {
  constructor({ eventLoopResolutionMs = 20 } = {}) {
    this.startedAt = Date.now()
    this.counters = {
      socketConnections: 0,
      socketDisconnections: 0,
      throttledEvents: 0,
      roomCreated: 0,
      roomDestroyed: 0,
      gameStarted: 0,
      gameEnded: 0,
      gameRestarted: 0,
      answerReceived: 0,
      answerCountBroadcasts: 0,
      reconnects: 0,
      transportBroadcasts: 0,
      transportDirectSends: 0,
      kickedSockets: 0,
      closedRooms: 0,
    }
    this.throttledByEvent = {}
    this.eventLoopDelay = monitorEventLoopDelay({ resolution: eventLoopResolutionMs })
    this.eventLoopDelay.enable()
  }

  attachBus(bus) {
    bus.on(BUS.ROOM_CREATED, () => { this.counters.roomCreated += 1 })
    bus.on(BUS.ROOM_DESTROYED, () => { this.counters.roomDestroyed += 1 })
    bus.on(BUS.GAME_STARTED, () => { this.counters.gameStarted += 1 })
    bus.on(BUS.GAME_ENDED, () => { this.counters.gameEnded += 1 })
    bus.on(BUS.GAME_RESTARTED, () => { this.counters.gameRestarted += 1 })
    bus.on(BUS.ANSWER_RECEIVED, () => { this.counters.answerReceived += 1 })
    bus.on(BUS.BROADCAST, ({ event }) => {
      this.counters.transportBroadcasts += 1

      if (event === EVENTS.GAME_PLAYER_ANSWER) {
        this.counters.answerCountBroadcasts += 1
      }
    })
    bus.on(BUS.SEND_TO, () => { this.counters.transportDirectSends += 1 })
    bus.on(BUS.KICK, () => { this.counters.kickedSockets += 1 })
    bus.on(BUS.CLOSE_ROOM, () => { this.counters.closedRooms += 1 })
  }

  recordSocketConnected() {
    this.counters.socketConnections += 1
  }

  recordSocketDisconnected() {
    this.counters.socketDisconnections += 1
  }

  recordReconnect() {
    this.counters.reconnects += 1
  }

  recordThrottledEvent(event) {
    this.counters.throttledEvents += 1
    this.throttledByEvent[event] = (this.throttledByEvent[event] ?? 0) + 1
  }

  snapshot({ io, roomManager } = {}) {
    const memory = process.memoryUsage()
    const roomStats = roomManager?.stats?.() ?? {}

    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      rooms: roomStats.rooms ?? 0,
      players: roomStats.players ?? 0,
      connectedPlayers: roomStats.connectedPlayers ?? 0,
      sockets: io?.of('/')?.sockets?.size ?? 0,
      memory: {
        heapUsedMb: bytesToMb(memory.heapUsed),
        rssMb: bytesToMb(memory.rss),
      },
      eventLoopDelayP95Ms: Math.round(this.eventLoopDelay.percentile(95) / 1e6),
      counters: { ...this.counters },
      throttledByEvent: { ...this.throttledByEvent },
    }
  }

  destroy() {
    this.eventLoopDelay.disable()
  }
}
