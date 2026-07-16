import { GameError } from './errors.js'

export class SocketEventGuard {
  constructor({
    metrics = null,
    eventLimit = 120,
    eventWindowMs = 10_000,
    answerLimit = 20,
    answerWindowMs = 10_000,
    reconnectLimit = 12,
    reconnectWindowMs = 60_000,
    managerControlLimit = 30,
    managerControlWindowMs = 10_000,
  } = {}) {
    this.metrics = metrics
    this.defaults = {
      event: { limit: eventLimit, windowMs: eventWindowMs },
      answer: { limit: answerLimit, windowMs: answerWindowMs },
      reconnect: { limit: reconnectLimit, windowMs: reconnectWindowMs },
      managerControl: { limit: managerControlLimit, windowMs: managerControlWindowMs },
    }
    this.buckets = new Map()
  }

  assertAllowed(socket, key, ruleName = 'event', message = 'Too many requests; wait a moment and try again') {
    const rule = this.defaults[ruleName] ?? this.defaults.event
    const bucketKey = `${socket.id}:${key}`
    const now = Date.now()
    const cutoff = now - rule.windowMs
    const current = this.buckets.get(bucketKey) ?? []
    const timestamps = current.filter((timestamp) => timestamp > cutoff)

    if (timestamps.length >= rule.limit) {
      this.buckets.set(bucketKey, timestamps)
      this.metrics?.recordThrottledEvent?.(key)
      throw new GameError(message)
    }

    timestamps.push(now)
    this.buckets.set(bucketKey, timestamps)
  }

  cleanupSocket(socketId) {
    const prefix = `${socketId}:`

    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key)
      }
    }
  }

  destroy() {
    this.buckets.clear()
  }
}
