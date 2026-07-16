import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { createGameServer } from '../src/index.js'
import { SocketEventGuard } from '../src/utils/SocketEventGuard.js'
import { GameError } from '../src/utils/errors.js'

const servers = []

afterEach(async () => {
  while (servers.length) {
    await servers.pop().close()
  }
})

describe('SocketEventGuard', () => {
  it('throttles noisy sockets and reports the dropped event', () => {
    const throttled = []
    const guard = new SocketEventGuard({
      metrics: { recordThrottledEvent: (event) => throttled.push(event) },
      eventLimit: 2,
      eventWindowMs: 10_000,
    })
    const socket = { id: 'socket-1' }

    guard.assertAllowed(socket, 'player:join')
    guard.assertAllowed(socket, 'player:join')
    assert.throws(() => guard.assertAllowed(socket, 'player:join'), GameError)
    assert.deepEqual(throttled, ['player:join'])

    guard.cleanupSocket(socket.id)
    guard.assertAllowed(socket, 'player:join')
  })
})

describe('health endpoints', () => {
  it('reports liveness, readiness, and metrics when enabled', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bazoot-health-'))
    const server = await createGameServer({
      env: {
        port: 0,
        clientUrl: 'http://localhost:5005',
        clientDistDir: path.join(tmpDir, 'client-dist'),
        databaseFile: ':memory:',
        quizzesDir: path.join(tmpDir, 'quizzes'),
        accountsFile: path.join(tmpDir, 'accounts.json'),
        sessionsFile: path.join(tmpDir, 'sessions.json'),
        uploadsDir: path.join(tmpDir, 'uploads'),
        uploadMaxBytes: 1024,
        sessionTtlMs: 60_000,
        allowRegistration: false,
        publicUrl: 'http://localhost:5005',
        mailProvider: 'console',
        emailVerification: 'off',
        redisUrl: '',
        maxPlayersPerRoom: 50,
        maxActiveRooms: 200,
        socketEventLimitPer10s: 120,
        playerAnswerLimitPer10s: 20,
        playerReconnectLimitPerMin: 12,
        managerControlLimitPer10s: 30,
        questionTimeLimit: 20,
        scoreMax: 1000,
        emptyGameTimeoutMs: 30_000,
        healthIncludeMetrics: true,
      },
    })
    servers.push(server)

    await new Promise((resolve) => server.httpServer.listen(0, resolve))
    const baseUrl = `http://localhost:${server.httpServer.address().port}`

    const live = await fetch(`${baseUrl}/health/live`)
    const ready = await fetch(`${baseUrl}/health/ready`)
    const metrics = await fetch(`${baseUrl}/metrics`)

    assert.equal(live.status, 200)
    assert.deepEqual(await live.json(), { status: 'ok' })
    assert.equal(ready.status, 200)
    assert.equal((await ready.json()).store.type, 'memory')
    assert.equal(metrics.status, 200)
    assert.equal((await metrics.json()).rooms, 0)

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
