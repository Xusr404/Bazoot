export class RateLimiter {
  constructor(maxAttempts = 5, lockMs = 30000) {
    this.maxAttempts = maxAttempts
    this.lockMs = lockMs
    this.store = new Map()
    
    // Sweep expired locks every 5 minutes to prevent memory leaks
    this.sweepInterval = setInterval(() => this.sweep(), 5 * 60 * 1000)
    this.sweepInterval.unref()
  }

  check(key) {
    const lock = this.store.get(key)
    if (lock && lock.lockedUntil > Date.now()) {
      return false
    }
    return true
  }

  recordFailure(key) {
    let lock = this.store.get(key)
    
    if (!lock || lock.lockedUntil <= Date.now()) {
      lock = { failures: 0, lockedUntil: 0 }
    }
    
    lock.failures += 1
    
    if (lock.failures >= this.maxAttempts) {
      lock.failures = 0
      lock.lockedUntil = Date.now() + this.lockMs
    }
    
    this.store.set(key, lock)
  }

  clear(key) {
    this.store.delete(key)
  }
  
  sweep() {
    const now = Date.now()
    for (const [key, lock] of this.store.entries()) {
      // Keep if lock is still active or failures haven't expired (give them lockMs to expire)
      if (lock.lockedUntil <= now && lock.failures === 0) {
        this.store.delete(key)
      } else if (lock.lockedUntil > 0 && lock.lockedUntil <= now - this.lockMs) {
        // Automatically age out old failure records if lock expired a while ago
         this.store.delete(key)
      }
    }
  }
  
  destroy() {
    clearInterval(this.sweepInterval)
  }
}
