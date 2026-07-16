import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import { rateLimit } from 'express-rate-limit'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server as SocketServer } from 'socket.io'
import { AccountService } from './accounts/AccountService.js'
import { SessionManager } from './accounts/SessionManager.js'
import { SQLiteAccountStore } from './accounts/SQLiteAccountStore.js'
import { env as defaultEnv } from './config/env.js'
import { RuntimeSettings } from './config/RuntimeSettings.js'
import { createDatabase } from './db/createDatabase.js'
import { createMailer } from './email/createMailer.js'
import { registerAdminHandlers } from './events/registerAdminHandlers.js'
import { registerConnectionHandlers } from './events/registerConnectionHandlers.js'
import { registerEngineActionHandlers } from './events/registerEngineActionHandlers.js'
import { registerManagerHandlers } from './events/registerManagerHandlers.js'
import { registerPlayerHandlers } from './events/registerPlayerHandlers.js'
import { bindTransport } from './events/transport.js'
import { GameEventBus } from './game/GameEventBus.js'
import { ServerMetrics } from './observability/ServerMetrics.js'
import { SQLiteQuestionProvider } from './questions/SQLiteQuestionProvider.js'
import { MemoryRoomStore } from './rooms/MemoryRoomStore.js'
import { RoomManager } from './rooms/RoomManager.js'
import { registerUploadRoutes } from './uploads/uploadRoute.js'
import { isValidClientId } from './utils/clientId.js'
import { SocketEventGuard } from './utils/SocketEventGuard.js'
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisRoomStore } from './rooms/RedisRoomStore.js'

const spaSecurityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
}

const applySpaSecurityHeaders = (res) => {
  for (const [name, value] of Object.entries(spaSecurityHeaders)) {
    res.setHeader(name, value)
  }
}

// Factory so tests (server/test-flow.js) can spin up an isolated instance with
// their own env/provider. The default wiring is documented in docs/architecture.md.
export const createGameServer = async ({
  env = defaultEnv,
  questionProvider,
  bus = new GameEventBus(),
  store = null,
  accountService,
  runtimeSettings,
} = {}) => {
  const metrics = new ServerMetrics()
  metrics.attachBus(bus)
  const db = createDatabase(env.databaseFile ?? defaultEnv.databaseFile)

  if (!runtimeSettings) {
    runtimeSettings = new RuntimeSettings({
      db,
      defaults: {
        allowRegistration: env.allowRegistration ?? defaultEnv.allowRegistration,
        maxPlayersPerRoom: env.maxPlayersPerRoom ?? defaultEnv.maxPlayersPerRoom,
        questionTimeLimit: env.questionTimeLimit ?? defaultEnv.questionTimeLimit,
        scoreMax: env.scoreMax ?? defaultEnv.scoreMax,
      },
    })
  }

  const settings = runtimeSettings.snapshot()

  if (accountService?.setAllowRegistration) {
    accountService.setAllowRegistration(settings.allowRegistration)
  }

  if (!accountService) {
    const { mailer, requireVerification, mailProvider, mailConfigured, mailWarnings } =
      createMailer(env)

    for (const warning of mailWarnings) {
      console.warn(`Email: ${warning}`)
    }

    console.log(
      `Email: provider=${mailProvider} ${mailConfigured ? 'configured' : 'console mode'}, ` +
        `verification ${requireVerification ? 'ENFORCED' : 'disabled'} (EMAIL_VERIFICATION=${env.emailVerification ?? 'auto'})`,
    )

    if (mailConfigured && typeof mailer.verify === 'function') {
      try {
        await mailer.verify()
        console.log(`Email: provider=${mailProvider} connection verified`)
      } catch (error) {
        console.warn(`Email: provider=${mailProvider} connection check failed: ${error.message}`)
      }
    }

    accountService = new AccountService({
      store: new SQLiteAccountStore({
        db,
        legacyFilePath: env.accountsFile ?? defaultEnv.accountsFile,
      }),
      sessions: new SessionManager({
        db,
        ttlMs: env.sessionTtlMs ?? defaultEnv.sessionTtlMs,
        filePath: env.sessionsFile ?? defaultEnv.sessionsFile,
      }),
      mailer,
      requireVerification,
      allowRegistration: settings.allowRegistration,
      publicUrl: env.publicUrl ?? defaultEnv.publicUrl,
      verificationTtlMs: env.verificationTtlMs ?? defaultEnv.verificationTtlMs,
      passwordResetTtlMs: env.passwordResetTtlMs ?? defaultEnv.passwordResetTtlMs,
    })

    if (!questionProvider) {
      questionProvider = new SQLiteQuestionProvider({
        db,
        legacyDir: env.quizzesDir ?? defaultEnv.quizzesDir,
      })
    }
  }

  if (!questionProvider) {
    questionProvider = new SQLiteQuestionProvider({
      db,
      legacyDir: env.quizzesDir ?? defaultEnv.quizzesDir,
    })
  }

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })
  app.use(globalLimiter)

  // Baseline security headers on every HTTP response (E2). The SPA itself is
  // served by Vite preview / the front proxy, which carry their own CSP; this
  // covers the API + /health + /uploads (which adds stricter headers of its own).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })
  app.use(cors({ origin: env.clientUrl }))
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' })
  })
  registerUploadRoutes(app, { accountService, env })

  const clientDistDir = env.clientDistDir ?? defaultEnv.clientDistDir
  const clientIndexPath = path.join(clientDistDir, 'index.html')

  if (fs.existsSync(clientIndexPath)) {
    app.use(
      express.static(clientDistDir, {
        index: false,
        setHeaders: applySpaSecurityHeaders,
      }),
    )

    app.use((req, res, next) => {
      if (
        req.method !== 'GET' ||
        req.path === '/health' ||
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/ws') ||
        !req.headers.accept?.includes('text/html')
      ) {
        next()
        return
      }

      applySpaSecurityHeaders(res)
      res.sendFile(clientIndexPath)
    })
  }

  const httpServer = http.createServer(app)
  const io = new SocketServer(httpServer, {
    path: '/ws',
    cors: { origin: env.clientUrl },
  })

  io.use((socket, next) => {
    if (!isValidClientId(socket.handshake.auth.clientId)) {
      next(new Error('Missing or invalid client id'))

      return
    }

    next()
  })

  let activeStore = store
  if (!activeStore) {
    if (env.redisUrl) {
      console.log(`Redis enabled. Connecting to ${env.redisUrl}`)
      const pubClient = createClient({ url: env.redisUrl })
      const subClient = pubClient.duplicate()
      await Promise.all([pubClient.connect(), subClient.connect()])
      
      activeStore = new RedisRoomStore({ pubClient, subClient })
      await activeStore.initialize()
      
      io.adapter(createAdapter(pubClient, subClient))
    } else {
      activeStore = new MemoryRoomStore()
    }
  }

  const roomManager = new RoomManager({
    store: activeStore,
    bus,
    maxPlayersPerRoom: settings.maxPlayersPerRoom,
    maxActiveRooms: env.maxActiveRooms ?? defaultEnv.maxActiveRooms,
    emptyGameTimeoutMs: env.emptyGameTimeoutMs,
  })

  const socketGuard = new SocketEventGuard({
    metrics,
    eventLimit: env.socketEventLimitPer10s ?? defaultEnv.socketEventLimitPer10s,
    answerLimit: env.playerAnswerLimitPer10s ?? defaultEnv.playerAnswerLimitPer10s,
    reconnectLimit: env.playerReconnectLimitPerMin ?? defaultEnv.playerReconnectLimitPerMin,
    managerControlLimit: env.managerControlLimitPer10s ?? defaultEnv.managerControlLimitPer10s,
  })

  app.get('/health/ready', async (_req, res) => {
    const storeHealth = await activeStore.health?.() ?? { status: 'ok', type: 'unknown' }
    const ready = storeHealth.status === 'ok'
    const payload = {
      status: ready ? 'ok' : 'degraded',
      store: storeHealth,
    }

    if (env.healthIncludeMetrics ?? defaultEnv.healthIncludeMetrics) {
      payload.metrics = metrics.snapshot({ io, roomManager })
    }

    res.status(ready ? 200 : 503).json(payload)
  })

  if (env.healthIncludeMetrics ?? defaultEnv.healthIncludeMetrics) {
    app.get('/metrics', (_req, res) => {
      res.json(metrics.snapshot({ io, roomManager }))
    })
  }

  bindTransport(io, bus)

  io.on('connection', (socket) => {
    metrics.recordSocketConnected()
    socket.once('disconnect', () => {
      metrics.recordSocketDisconnected()
      socketGuard.cleanupSocket(socket.id)
    })

    console.log(
      `A user connected: socketId: ${socket.id}, clientId: ${socket.handshake.auth.clientId}`,
    )

    registerManagerHandlers({ io, socket, roomManager, questionProvider, accountService, bus, env, runtimeSettings, socketGuard, metrics })
    registerAdminHandlers({ socket, roomManager, accountService, questionProvider, env, runtimeSettings })
    registerPlayerHandlers({ io, socket, roomManager, bus, socketGuard, metrics })
    registerConnectionHandlers({ io, socket, roomManager, bus })
  })

  io.serverSideEmit?.('ready') // to ensure TS / adapter is loaded
  
  registerEngineActionHandlers({ io, roomManager })

  const close = async () => {
    roomManager.shutdown()
    socketGuard.destroy()
    metrics.destroy()
    await new Promise((resolve) => io.close(resolve))
    await activeStore.close?.()
    await new Promise((resolve) => httpServer.close(resolve))
  }

  return { app, httpServer, io, roomManager, bus, questionProvider, accountService, runtimeSettings, metrics, close }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const start = async () => {
    try {
      const { httpServer, roomManager } = await createGameServer()

      httpServer.listen(defaultEnv.port, () => {
        console.log(`Game server running on port ${defaultEnv.port} (socket path /ws)`)
      })

      const shutdown = () => {
        roomManager.shutdown()
        process.exit(0)
      }

      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    } catch (err) {
      console.error('Failed to start server:', err)
      process.exit(1)
    }
  }
  
  start()

  // Phase 9E: a game error must never take the process down.
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason)
  })
}
