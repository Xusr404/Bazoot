import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let DatabaseSync

try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch (error) {
  if (error?.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') {
    throw error
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    username     TEXT    PRIMARY KEY,
    salt         TEXT    NOT NULL,
    hash         TEXT    NOT NULL,
    email        TEXT,
    email_verified   INTEGER NOT NULL DEFAULT 1,
    approval_pending INTEGER NOT NULL DEFAULT 0,
    role         TEXT    NOT NULL DEFAULT 'editor',
    created_at   TEXT    NOT NULL,
    verification TEXT,
    reset        TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash   TEXT    PRIMARY KEY,
    username     TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    user_agent   TEXT,
    address      TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS organizations (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS memberships (
    organization_id TEXT NOT NULL,
    username        TEXT NOT NULL,
    role            TEXT NOT NULL,
    joined_at       TEXT NOT NULL,
    PRIMARY KEY (organization_id, username)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS invitations (
    token_hash       TEXT    PRIMARY KEY,
    email            TEXT    NOT NULL,
    role             TEXT    NOT NULL,
    organization_id  TEXT    NOT NULL,
    existing_account INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    expires_at       INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS quizzes (
    id              TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    subject         TEXT NOT NULL,
    questions       TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (id, organization_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS app_settings (
    "key"     TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`

export function createDatabase(filePath) {
  if (!DatabaseSync) {
    throw new Error(
      'Bazoot requires Node.js 22.13.0 or newer because the server uses the built-in node:sqlite module. ' +
        `Current runtime: ${process.version}. Upgrade Node, then restart with npm run dev.`,
    )
  }

  mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec(SCHEMA)
  return db
}
