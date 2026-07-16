import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RuntimeSettings } from '../src/config/RuntimeSettings.js'
import { createDatabase } from '../src/db/createDatabase.js'

const defaults = {
  allowRegistration: false,
  maxPlayersPerRoom: 50,
  questionTimeLimit: 20,
  scoreMax: 1000,
}

const makeSettings = (overrideDefaults = defaults) =>
  new RuntimeSettings({
    db: createDatabase(':memory:'),
    defaults: overrideDefaults,
  })

describe('RuntimeSettings', () => {
  it('seeds missing settings from defaults', () => {
    const settings = makeSettings()

    assert.deepEqual(settings.snapshot(), defaults)
  })

  it('keeps database values after a new instance is created with different defaults', () => {
    const db = createDatabase(':memory:')
    const first = new RuntimeSettings({ db, defaults })
    first.update({ allowRegistration: true, maxPlayersPerRoom: 75 })

    const second = new RuntimeSettings({
      db,
      defaults: {
        allowRegistration: false,
        maxPlayersPerRoom: 10,
        questionTimeLimit: 30,
        scoreMax: 500,
      },
    })

    assert.equal(second.snapshot().allowRegistration, true)
    assert.equal(second.snapshot().maxPlayersPerRoom, 75)
  })

  it('rejects unknown and invalid settings', () => {
    const settings = makeSettings()

    assert.throws(() => settings.update({ port: 3001 }), /Unknown runtime setting/)
    assert.throws(() => settings.update({ allowRegistration: 'true' }), /boolean/)
    assert.throws(() => settings.update({ maxPlayersPerRoom: 0 }), /between 1 and 500/)
    assert.throws(() => settings.update({ questionTimeLimit: 301 }), /between 5 and 300/)
    assert.throws(() => settings.update({ scoreMax: 100001 }), /between 1 and 100000/)
  })

  it('persists partial updates without changing other settings', () => {
    const settings = makeSettings()

    settings.update({ scoreMax: 2500 })

    assert.deepEqual(settings.snapshot(), {
      ...defaults,
      scoreMax: 2500,
    })
  })
})
