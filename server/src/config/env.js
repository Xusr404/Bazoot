import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(dirname, '../..')

dotenv.config({ path: path.resolve(serverRoot, '.env'), quiet: true })

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10)

  return Number.isNaN(parsed) ? fallback : parsed
}

// Single access point for all configuration (Phase 9D). Nothing else reads process.env.
export const env = {
  port: toInt(process.env.PORT, 3001),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3000',
  clientDistDir: path.resolve(serverRoot, process.env.CLIENT_DIST_DIR ?? '../client/dist'),
  maxPlayersPerRoom: toInt(process.env.MAX_PLAYERS_PER_ROOM, 50),
  maxActiveRooms: toInt(process.env.MAX_ACTIVE_ROOMS, 200),
  socketEventLimitPer10s: toInt(process.env.SOCKET_EVENT_LIMIT_PER_10S, 120),
  playerAnswerLimitPer10s: toInt(process.env.PLAYER_ANSWER_LIMIT_PER_10S, 20),
  playerReconnectLimitPerMin: toInt(process.env.PLAYER_RECONNECT_LIMIT_PER_MIN, 12),
  managerControlLimitPer10s: toInt(process.env.MANAGER_CONTROL_LIMIT_PER_10S, 30),
  healthIncludeMetrics: process.env.HEALTH_INCLUDE_METRICS === 'true',
  questionTimeLimit: toInt(process.env.QUESTION_TIME_LIMIT, 20),
  scoreMax: toInt(process.env.SCORE_MAX, 1000),
  emptyGameTimeoutMs: toInt(process.env.EMPTY_GAME_TIMEOUT_MS, 5 * 60 * 1000),
  databaseFile: path.resolve(serverRoot, process.env.DATABASE_FILE ?? './bazoot.db'),
  quizzesDir: path.resolve(serverRoot, process.env.QUIZZES_DIR ?? './quizzes'),
  accountsFile: path.resolve(serverRoot, process.env.ACCOUNTS_FILE ?? './accounts.json'),
  // Uploaded question media (images/video/audio) — saved here, served at /uploads.
  uploadsDir: path.resolve(serverRoot, process.env.UPLOADS_DIR ?? './uploads'),
  uploadMaxBytes: toInt(process.env.UPLOAD_MAX_BYTES, 50 * 1024 * 1024),
  sessionsFile: path.resolve(serverRoot, process.env.SESSIONS_FILE ?? './sessions.json'),
  sessionTtlMs: toInt(process.env.MANAGER_SESSION_TTL_MS, 180 * 24 * 60 * 60 * 1000),
  // Public self-registration (off by default — managers can always add accounts).
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  // Site-admin gate (admin panel). When set, ONLY this exact username may reach
  // the admin endpoints. When empty (default), access falls back to owners of
  // the first/legacy organization — i.e. whoever ran first-run setup.
  adminUsername: process.env.ADMIN_USERNAME || '',
  passwordResetTtlMs: toInt(process.env.PASSWORD_RESET_TTL_MS, 60 * 60 * 1000), // 1 h

  // Email / verification (see src/email/createMailer.js)
  mailProvider: process.env.MAIL_PROVIDER || 'auto', // auto | console | smtp
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: toInt(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpTimeoutMs: toInt(process.env.SMTP_TIMEOUT_MS, 10_000),
  mailFrom: process.env.MAIL_FROM || 'Bazoot <no-reply@localhost>',
  emailVerification: process.env.EMAIL_VERIFICATION || 'auto', // auto | on | off
  // Externally reachable client URL used in verification links.
  publicUrl: process.env.PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5005',
  // Redis connection string (e.g. redis://localhost:6379)
  redisUrl: process.env.REDIS_URL || '',
}
