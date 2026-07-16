import crypto from 'node:crypto'
import fs from 'node:fs'

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

function withTransaction(db, fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err
  }
}

// Opaque manager sessions backed by SQLite.
// Legacy sessions.json are migrated on the first load.
export class SessionManager {
  constructor({ db, ttlMs = 180 * 24 * 60 * 60 * 1000, filePath = null } = {}) {
    if (!db) throw new Error('Database is required for SessionManager')
    this.db = db
    this.ttlMs = ttlMs
    
    // Prepared statements
    this.insertStmt = db.prepare(`
      INSERT INTO sessions (token_hash, username, created_at, last_seen_at, expires_at, user_agent, address)
      VALUES ($tokenHash, $username, $createdAt, $lastSeenAt, $expiresAt, $userAgent, $address)
    `)
    this.getStmt = db.prepare('SELECT * FROM sessions WHERE token_hash = ?')
    this.deleteStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    this.updateStmt = db.prepare(`
      UPDATE sessions 
      SET expires_at = $expiresAt, last_seen_at = $lastSeenAt, user_agent = $userAgent, address = $address
      WHERE token_hash = $tokenHash
    `)
    this.deleteAllForUserStmt = db.prepare('DELETE FROM sessions WHERE username = ?')
    this.listForUserStmt = db.prepare('SELECT * FROM sessions WHERE username = ? ORDER BY created_at DESC')
    this.deleteExpiredStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')

    this.migrateLegacyFile(filePath)
    this.cleanupExpired()
  }

  migrateLegacyFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return
    }

    try {
      // Only migrate if sessions table is empty
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count
      if (count > 0) {
        fs.unlinkSync(filePath)
        return
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const now = Date.now()

      withTransaction(this.db, () => {
        for (const session of data.sessions ?? []) {
          if (
            typeof session.tokenHash === 'string' &&
            typeof session.username === 'string' &&
            session.expiresAt > now
          ) {
            this.insertStmt.run({
              tokenHash: session.tokenHash,
              username: session.username,
              createdAt: session.createdAt ?? session.expiresAt - this.ttlMs,
              lastSeenAt: session.lastSeenAt ?? session.createdAt ?? session.expiresAt - this.ttlMs,
              expiresAt: session.expiresAt,
              userAgent: session.userAgent ?? null,
              address: session.address ?? null,
            })
          }
        }
      })
      
      // Delete legacy file after successful migration
      fs.unlinkSync(filePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Could not migrate legacy manager sessions:', error)
      }
    }
  }

  cleanupExpired() {
    this.deleteExpiredStmt.run(Date.now())
  }

  create(username, metadata = {}) {
    const token = crypto.randomBytes(32).toString('hex')
    const createdAt = Date.now()
    
    this.insertStmt.run({
      tokenHash: tokenHash(token),
      username,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: createdAt + this.ttlMs,
      userAgent: metadata.userAgent ? String(metadata.userAgent) : null,
      address: metadata.address ? String(metadata.address) : null,
    })

    return token
  }

  /** @returns {string | null} username, or null if unknown/expired */
  resolve(token, metadata = {}) {
    if (typeof token !== 'string') {
      return null
    }

    const hash = tokenHash(token)
    const session = this.getStmt.get(hash)

    if (!session) {
      return null
    }

    const now = Date.now()
    if (session.expires_at <= now) {
      this.deleteStmt.run(hash)
      return null
    }

    // Refresh only in the latter half of the session lifetime
    let changed = false
    let expiresAt = session.expires_at
    let lastSeenAt = session.last_seen_at
    let userAgent = session.user_agent
    let address = session.address

    if (expiresAt - now < this.ttlMs / 2) {
      expiresAt = now + this.ttlMs
      changed = true
    }

    if (now - lastSeenAt > 5 * 60 * 1000) {
      lastSeenAt = now
      changed = true
    }

    if (metadata.userAgent && String(metadata.userAgent) !== userAgent) {
      userAgent = String(metadata.userAgent)
      changed = true
    }

    if (metadata.address && String(metadata.address) !== address) {
      address = String(metadata.address)
      changed = true
    }

    if (changed) {
      this.updateStmt.run({
        tokenHash: hash,
        expiresAt,
        lastSeenAt,
        userAgent,
        address,
      })
    }

    return session.username
  }

  revoke(token) {
    if (typeof token === 'string') {
      this.deleteStmt.run(tokenHash(token))
    }
  }

  revokeAllFor(username) {
    this.deleteAllForUserStmt.run(username)
  }

  revokeFor(username, sessionId) {
    if (!/^[0-9a-f]{12}$/.test(String(sessionId))) {
      return false
    }

    // SQLite doesn't have a direct startsWith operator that uses indexes efficiently without LIKE
    // but since we need to match the first 12 chars of the hash:
    const sessions = this.listForUserStmt.all(username)
    const match = sessions.find((s) => s.token_hash.startsWith(String(sessionId)))

    if (!match) {
      return false
    }

    this.deleteStmt.run(match.token_hash)
    return true
  }

  idFor(token) {
    return typeof token === 'string' ? tokenHash(token).slice(0, 12) : null
  }

  listFor(username, currentToken) {
    this.cleanupExpired() // piggyback cleanup here
    
    const currentHash = typeof currentToken === 'string' ? tokenHash(currentToken) : null
    const sessions = this.listForUserStmt.all(username)
    
    return sessions.map((session) => ({
      id: session.token_hash.slice(0, 12),
      current: session.token_hash === currentHash,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      expiresAt: session.expires_at,
      userAgent: session.user_agent || '',
      address: session.address || '',
    }))
  }
}
