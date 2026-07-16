import { GameError } from '../utils/errors.js'

export const RUNTIME_SETTING_LIMITS = {
  maxPlayersPerRoom: { min: 1, max: 500 },
  questionTimeLimit: { min: 5, max: 300 },
  scoreMax: { min: 1, max: 100000 },
}

const SETTING_KEYS = new Set([
  'allowRegistration',
  'maxPlayersPerRoom',
  'questionTimeLimit',
  'scoreMax',
])

const nowIso = () => new Date().toISOString()

const withTransaction = (db, fn) => {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw error
  }
}

const requireInteger = (key, value, { min, max }) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new GameError(`${key} must be an integer between ${min} and ${max}`)
  }

  return value
}

const validateSetting = (key, value) => {
  if (!SETTING_KEYS.has(key)) {
    throw new GameError(`Unknown runtime setting: ${key}`)
  }

  if (key === 'allowRegistration') {
    if (typeof value !== 'boolean') {
      throw new GameError('allowRegistration must be a boolean')
    }

    return value
  }

  return requireInteger(key, value, RUNTIME_SETTING_LIMITS[key])
}

const parseStoredValue = (key, value) => {
  try {
    return validateSetting(key, JSON.parse(value))
  } catch (error) {
    if (error instanceof GameError) {
      throw error
    }

    throw new GameError(`Invalid stored runtime setting: ${key}`)
  }
}

export class RuntimeSettings {
  constructor({ db, defaults }) {
    this.db = db
    this.defaults = this.validateDefaults(defaults)
    this.seedDefaults()
  }

  validateDefaults(defaults) {
    const validated = {}

    for (const key of SETTING_KEYS) {
      validated[key] = validateSetting(key, defaults[key])
    }

    return validated
  }

  seedDefaults() {
    const insert = this.db.prepare(`
      INSERT INTO app_settings ("key", value, updated_at)
      VALUES ($key, $value, $updated_at)
      ON CONFLICT("key") DO NOTHING
    `)

    withTransaction(this.db, () => {
      const updatedAt = nowIso()

      for (const [key, value] of Object.entries(this.defaults)) {
        insert.run({
          key,
          value: JSON.stringify(value),
          updated_at: updatedAt,
        })
      }
    })
  }

  snapshot() {
    const rows = this.db.prepare('SELECT "key" AS key, value FROM app_settings').all()
    const settings = { ...this.defaults }

    for (const row of rows) {
      if (SETTING_KEYS.has(row.key)) {
        settings[row.key] = parseStoredValue(row.key, row.value)
      }
    }

    return settings
  }

  update(partial) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      throw new GameError('Runtime settings update must be an object')
    }

    const entries = Object.entries(partial)

    if (entries.length === 0) {
      return this.snapshot()
    }

    const validated = {}

    for (const [key, value] of entries) {
      validated[key] = validateSetting(key, value)
    }

    const upsert = this.db.prepare(`
      INSERT INTO app_settings ("key", value, updated_at)
      VALUES ($key, $value, $updated_at)
      ON CONFLICT("key") DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)

    withTransaction(this.db, () => {
      const updatedAt = nowIso()

      for (const [key, value] of Object.entries(validated)) {
        upsert.run({
          key,
          value: JSON.stringify(value),
          updated_at: updatedAt,
        })
      }
    })

    return this.snapshot()
  }
}
