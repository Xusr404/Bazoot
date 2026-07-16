import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { io as ioClient } from 'socket.io-client'
import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { AccountService } from '../src/accounts/AccountService.js'
import { MemoryAccountStore } from '../src/accounts/AccountStore.js'
import { SessionManager } from '../src/accounts/SessionManager.js'
import { createDatabase } from '../src/db/createDatabase.js'
import { createGameServer } from '../src/index.js'
import { QuestionProvider } from '../src/questions/QuestionProvider.js'

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const config = {
  rooms: toInt(process.env.LOAD_ROOMS, 3),
  playersPerRoom: toInt(process.env.LOAD_PLAYERS_PER_ROOM, 20),
  questions: toInt(process.env.LOAD_QUESTIONS, 1),
  reconnectPlayersPerRoom: toInt(process.env.LOAD_RECONNECT_PLAYERS_PER_ROOM, 0),
  disconnectPlayersPerRoom: toInt(process.env.LOAD_DISCONNECT_PLAYERS_PER_ROOM, 0),
  timeoutMs: toInt(process.env.LOAD_TIMEOUT_MS, 45_000),
  maxRevealP95Ms: toInt(process.env.LOAD_MAX_REVEAL_P95_MS, 0),
  maxAnswerCountEvents: toInt(process.env.LOAD_MAX_ANSWER_COUNT_EVENTS, 0),
  maxEventLoopDelayP95Ms: toInt(process.env.LOAD_MAX_EVENT_LOOP_DELAY_P95_MS, 0),
  maxHeapUsedMb: toInt(process.env.LOAD_MAX_HEAP_USED_MB, 0),
  maxRssMb: toInt(process.env.LOAD_MAX_RSS_MB, 0),
  redisUrl: process.env.LOAD_REDIS_URL ?? '',
  managerDoubleClicks: process.env.LOAD_MANAGER_DOUBLE_CLICKS !== 'false',
}

const makeQuestions = (count) =>
  Array.from({ length: count }, (_, index) => ({
    question: `Choose the first answer ${index + 1}`,
    answers: ['Correct', 'Wrong', 'Also wrong', 'Still wrong'],
    solution: 0,
    cooldown: 0,
    time: 5,
  }))

const quiz = {
  id: 'load-quiz',
  subject: 'Load Test Quiz',
  questions: makeQuestions(config.questions),
}

class LoadQuestionProvider extends QuestionProvider {
  async listQuizzes() {
    return [quiz]
  }

  async getQuestions(_organizationId, quizzId) {
    return quizzId === quiz.id ? quiz : undefined
  }
}

const fail = (message) => {
  throw new Error(message)
}

const waitFor = (socket, event, predicate = () => true, label = event, timeoutMs = config.timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${label}`))
    }, timeoutMs)

    const handler = (payload) => {
      if (!predicate(payload)) return
      cleanup()
      resolve(payload)
    }

    const errorHandler = (message) => {
      cleanup()
      reject(new Error(`${label} failed: ${message}`))
    }

    const cleanup = () => {
      clearTimeout(timer)
      socket.off(event, handler)
      socket.off(EVENTS.GAME_ERROR_MESSAGE, errorHandler)
      socket.off(EVENTS.MANAGER_ERROR_MESSAGE, errorHandler)
    }

    socket.on(event, handler)
    socket.on(EVENTS.GAME_ERROR_MESSAGE, errorHandler)
    socket.on(EVENTS.MANAGER_ERROR_MESSAGE, errorHandler)
  })

const waitForStatus = (socket, name) =>
  waitFor(socket, EVENTS.GAME_STATUS, (status) => status?.name === name, `status ${name}`)

const connectSocket = async (url, clientId) => {
  const socket = ioClient(url, {
    path: '/ws',
    auth: { clientId },
    transports: ['websocket'],
    reconnection: false,
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out connecting ${clientId}`)), config.timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })

  socket.loadClientId = clientId

  return socket
}

const percentile = (values, p) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

const bytesToMb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bazoot-load-'))
  const sockets = []
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
  const timings = {
    createRoomMs: [],
    joinRoomMs: [],
    revealMs: [],
  }
  let answerCountEvents = 0
  let reconnectAttempts = 0
  let successfulReconnects = 0
  let forcedDisconnects = 0

  eventLoopDelay.enable()
  const startedAt = performance.now()

  const accountService = new AccountService({
    store: new MemoryAccountStore(),
    sessions: new SessionManager({ db: createDatabase(':memory:') }),
    requireVerification: false,
  })
  const server = await createGameServer({
    env: {
      port: 0,
      clientUrl: 'http://localhost:5005',
      clientDistDir: path.join(tmpDir, 'client-dist'),
      maxPlayersPerRoom: config.playersPerRoom,
      questionTimeLimit: 5,
      scoreMax: 1000,
      emptyGameTimeoutMs: 30_000,
      databaseFile: ':memory:',
      quizzesDir: path.join(tmpDir, 'quizzes'),
      accountsFile: path.join(tmpDir, 'accounts.json'),
      uploadsDir: path.join(tmpDir, 'uploads'),
      uploadMaxBytes: 1024,
      sessionsFile: path.join(tmpDir, 'sessions.json'),
      sessionTtlMs: 60 * 60 * 1000,
      allowRegistration: false,
      publicUrl: 'http://localhost:5005',
      mailProvider: 'console',
      emailVerification: 'off',
      redisUrl: config.redisUrl,
      maxActiveRooms: Math.max(config.rooms + 5, 200),
      socketEventLimitPer10s: 240,
      playerAnswerLimitPer10s: 40,
      playerReconnectLimitPerMin: Math.max(config.reconnectPlayersPerRoom + 12, 12),
      managerControlLimitPer10s: 60,
      healthIncludeMetrics: true,
    },
    questionProvider: new LoadQuestionProvider(),
    accountService,
  })

  try {
    await new Promise((resolve) => server.httpServer.listen(0, resolve))
    const url = `http://localhost:${server.httpServer.address().port}`
    const bootstrap = await connectSocket(url, 'load-manager-bootstrap')
    sockets.push(bootstrap)

    const authSuccess = waitFor(bootstrap, EVENTS.MANAGER_AUTH_SUCCESS)
    bootstrap.emit(EVENTS.MANAGER_SETUP, {
      username: 'load-admin',
      password: 'load-pass-123',
      email: 'load@example.test',
    })
    const session = await authSuccess
    const managers = [bootstrap]

    for (let roomIndex = 1; roomIndex < config.rooms; roomIndex += 1) {
      const manager = await connectSocket(url, `load-manager-${roomIndex}`)
      sockets.push(manager)
      const authState = waitFor(
        manager,
        EVENTS.MANAGER_AUTH_STATE,
        (state) => state?.state === 'authenticated',
        'manager auth resume',
      )
      manager.emit(EVENTS.MANAGER_AUTH_STATUS, { token: session.token })
      await authState
      managers.push(manager)
    }

    const rooms = []

    for (let roomIndex = 0; roomIndex < config.rooms; roomIndex += 1) {
      const manager = managers[roomIndex]
      const createdAt = performance.now()
      const created = waitFor(manager, EVENTS.MANAGER_GAME_CREATED)
      manager.emit(EVENTS.GAME_CREATE, quiz.id)
      const room = await created
      timings.createRoomMs.push(performance.now() - createdAt)
      rooms.push({ ...room, manager, players: [] })
    }

    for (const room of rooms) {
      const joinedAt = performance.now()
      const joins = []

      for (let playerIndex = 0; playerIndex < config.playersPerRoom; playerIndex += 1) {
        joins.push((async () => {
          const socket = await connectSocket(
            url,
            `load-player-${room.gameId}-${playerIndex}`,
          )
          sockets.push(socket)
          socket.emit(EVENTS.PLAYER_JOIN, room.inviteCode)
          await waitFor(socket, EVENTS.GAME_SUCCESS_ROOM)
          socket.emit(EVENTS.PLAYER_LOGIN, {
            gameId: room.gameId,
            data: { username: `Player${playerIndex}` },
          })
          await waitFor(socket, EVENTS.GAME_SUCCESS_JOIN)
          room.players.push(socket)
        })())
      }

      await Promise.all(joins)
      timings.joinRoomMs.push(performance.now() - joinedAt)

      const trackAnswerCount = () => {
        answerCountEvents += 1
      }

      room.manager.on(EVENTS.GAME_PLAYER_ANSWER, trackAnswerCount)

      room.players.forEach((socket) => {
        socket.on(EVENTS.GAME_PLAYER_ANSWER, trackAnswerCount)
      })

      room.trackAnswerCount = trackAnswerCount
    }

    await Promise.all(rooms.map(async (room) => {
      for (let questionIndex = 0; questionIndex < config.questions; questionIndex += 1) {
        const revealStartedAt = performance.now()
        const answerablePlayers = room.players.filter((socket) => socket?.connected)
        const selectAnswer = Promise.all(
          answerablePlayers.map((socket) => waitForStatus(socket, STATUS.SELECT_ANSWER)),
        )

        if (questionIndex === 0) {
          room.manager.emit(EVENTS.MANAGER_START_GAME, { gameId: room.gameId })

          if (config.managerDoubleClicks) {
            room.manager.emit(EVENTS.MANAGER_START_GAME, { gameId: room.gameId })
          }
        } else {
          room.manager.emit(EVENTS.MANAGER_NEXT_QUESTION, { gameId: room.gameId })

          if (config.managerDoubleClicks) {
            room.manager.emit(EVENTS.MANAGER_NEXT_QUESTION, { gameId: room.gameId })
          }
        }

        await selectAnswer

        if (questionIndex === 0 && config.reconnectPlayersPerRoom > 0) {
          const reconnectCount = Math.min(config.reconnectPlayersPerRoom, room.players.length)

          for (let index = 0; index < reconnectCount; index += 1) {
            room.players[index].disconnect()
            reconnectAttempts += 1
          }

          await sleep(25)

          for (let index = 0; index < reconnectCount; index += 1) {
            const oldSocket = room.players[index]
            const replacement = await connectSocket(url, oldSocket.loadClientId)
            sockets.push(replacement)
            replacement.on(EVENTS.GAME_PLAYER_ANSWER, room.trackAnswerCount)
            const reconnect = waitFor(replacement, EVENTS.PLAYER_SUCCESS_RECONNECT)
            replacement.emit(EVENTS.PLAYER_RECONNECT, { gameId: room.gameId })
            await reconnect
            room.players[index] = replacement
            successfulReconnects += 1
          }
        }

        if (questionIndex === 0 && config.disconnectPlayersPerRoom > 0) {
          const firstDisconnectIndex = Math.min(config.reconnectPlayersPerRoom, room.players.length)
          const disconnectCount = Math.min(
            config.disconnectPlayersPerRoom,
            Math.max(0, room.players.length - firstDisconnectIndex),
          )

          for (let offset = 0; offset < disconnectCount; offset += 1) {
            const index = firstDisconnectIndex + offset
            room.players[index].disconnect()
            room.players[index] = null
            forcedDisconnects += 1
          }

          await sleep(25)
        }

        const activePlayers = room.players.filter((socket) => socket?.connected)
        const results = activePlayers.map((socket, index) => {
          const result = waitForStatus(socket, STATUS.SHOW_RESULT)
          socket.emit(EVENTS.PLAYER_SELECTED_ANSWER, {
            gameId: room.gameId,
            data: { answerKey: index % 2 === 0 ? 0 : 1 },
          })

          return result
        })

        await Promise.all(results)
        timings.revealMs.push(performance.now() - revealStartedAt)

        if (questionIndex < config.questions - 1) {
          const leaderboard = waitForStatus(room.manager, STATUS.SHOW_LEADERBOARD)
          room.manager.emit(EVENTS.MANAGER_SHOW_LEADERBOARD, { gameId: room.gameId })
          await leaderboard
        } else {
          const finished = waitForStatus(room.manager, STATUS.FINISHED)
          room.manager.emit(EVENTS.MANAGER_SHOW_LEADERBOARD, { gameId: room.gameId })
          await finished
        }
      }
    }))

    const totalMs = performance.now() - startedAt
    const memory = process.memoryUsage()
    const summary = {
      rooms: config.rooms,
      playersPerRoom: config.playersPerRoom,
      questions: config.questions,
      totalPlayers: config.rooms * config.playersPerRoom,
      reconnectAttempts,
      successfulReconnects,
      forcedDisconnects,
      totalMs: Math.round(totalMs),
      createRoomP95Ms: Math.round(percentile(timings.createRoomMs, 95)),
      joinRoomP95Ms: Math.round(percentile(timings.joinRoomMs, 95)),
      revealP95Ms: Math.round(percentile(timings.revealMs, 95)),
      answerCountEvents,
      heapUsedMb: bytesToMb(memory.heapUsed),
      rssMb: bytesToMb(memory.rss),
      eventLoopDelayP95Ms: Math.round(eventLoopDelay.percentile(95) / 1e6),
    }

    console.log(JSON.stringify(summary, null, 2))

    const connectedPlayers = sockets.filter((socket) => socket.connected).length - managers.length
    const expectedConnectedPlayers = summary.totalPlayers - forcedDisconnects

    if (connectedPlayers !== expectedConnectedPlayers) {
      fail(
        `Connected player count ${connectedPlayers} does not match expected ${expectedConnectedPlayers}`,
      )
    }

    if (config.maxRevealP95Ms > 0 && summary.revealP95Ms > config.maxRevealP95Ms) {
      fail(`Reveal p95 ${summary.revealP95Ms}ms exceeds ${config.maxRevealP95Ms}ms`)
    }

    if (
      config.maxAnswerCountEvents > 0 &&
      summary.answerCountEvents > config.maxAnswerCountEvents
    ) {
      fail(
        `Answer-count events ${summary.answerCountEvents} exceeds ${config.maxAnswerCountEvents}`,
      )
    }

    if (summary.reconnectAttempts !== summary.successfulReconnects) {
      fail(`Reconnect attempts ${summary.reconnectAttempts} did not all succeed`)
    }

    if (
      config.maxEventLoopDelayP95Ms > 0 &&
      summary.eventLoopDelayP95Ms > config.maxEventLoopDelayP95Ms
    ) {
      fail(
        `Event-loop delay p95 ${summary.eventLoopDelayP95Ms}ms exceeds ${config.maxEventLoopDelayP95Ms}ms`,
      )
    }

    if (config.maxHeapUsedMb > 0 && summary.heapUsedMb > config.maxHeapUsedMb) {
      fail(`Heap used ${summary.heapUsedMb}MB exceeds ${config.maxHeapUsedMb}MB`)
    }

    if (config.maxRssMb > 0 && summary.rssMb > config.maxRssMb) {
      fail(`RSS ${summary.rssMb}MB exceeds ${config.maxRssMb}MB`)
    }
  } finally {
    eventLoopDelay.disable()
    sockets.forEach((socket) => socket.disconnect())
    await server.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(`Load run failed: ${error.message}`)
  process.exit(1)
})
