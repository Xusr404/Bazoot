import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { de } from '../src/i18n/de.js'
import {
  DEFAULT_LOCALE,
  getMessages,
  isSupportedLocale,
  LOCALE_REGISTRY,
  translate,
} from '../src/i18n/locales.js'

// The translation engine itself is trivial (lookup + {placeholder} interpolation);
// the realistic bug is a German value whose placeholders drift from its key
// (e.g. key '{count}' but value '{anzahl}'), which would render a literal token.
// These checks guard the dictionary as it grows.

const placeholders = (text) => (text.match(/\{(\w+)\}/g) ?? []).sort()

const collectSourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(target)
    }

    return /\.[jt]sx?$/.test(entry.name) ? [target] : []
  })

const literalTranslationKeys = () => {
  const keys = new Set()

  for (const file of collectSourceFiles(fileURLToPath(new URL('../src', import.meta.url)))) {
    const source = fs.readFileSync(file, 'utf8')

    for (const match of source.matchAll(/\bt\(\s*(['"`])([\s\S]*?)\1/g)) {
      const key = match[2]

      if (!key.includes('${') && key !== 'English source') {
        keys.add(key)
      }
    }
  }

  return keys
}

describe('de dictionary', () => {
  it('maps non-empty string keys to non-empty string values', () => {
    for (const [key, value] of Object.entries(de)) {
      assert.equal(typeof key, 'string')
      assert.ok(key.length > 0, 'empty key')
      assert.equal(typeof value, 'string', `value for "${key}" is not a string`)
      assert.ok(value.length > 0, `empty translation for "${key}"`)
    }
  })

  it('keeps every value placeholder backed by one in its key', () => {
    for (const [key, value] of Object.entries(de)) {
      const keyVars = new Set(placeholders(key))

      for (const token of placeholders(value)) {
        assert.ok(
          keyVars.has(token),
          `"${key}" → "${value}" uses ${token}, which is absent from the key`,
        )
      }
    }
  })

  it('translates representative player and manager strings', () => {
    assert.equal(de.Submit, 'Absenden')
    assert.equal(de['Nice!'], 'Super!')
    assert.equal(de.Leaderboard, 'Rangliste')
    assert.equal(de['Start Game'], 'Spiel starten')
  })

  it('covers every literal translation key used by the client', () => {
    const missing = [...literalTranslationKeys()].filter((key) => !(key in de))

    assert.deepEqual(missing, [], `missing German translations:\n${missing.join('\n')}`)
  })
})

describe('translation fallback', () => {
  it('falls back to English source strings for missing translations', () => {
    assert.equal(translate('de', 'An untranslated English string'), 'An untranslated English string')
    assert.equal(translate('unknown', 'English fallback'), 'English fallback')
  })

  it('interpolates values after selecting the fallback', () => {
    assert.equal(translate('de', 'Hello {name}', { name: 'Ada' }), 'Hello Ada')
  })

  it('keeps every registered language available through the shared registry', () => {
    assert.equal(DEFAULT_LOCALE, 'en')
    assert.ok(isSupportedLocale(DEFAULT_LOCALE))
    assert.equal(isSupportedLocale('toString'), false)

    for (const locale of Object.keys(LOCALE_REGISTRY)) {
      assert.equal(getMessages(locale), LOCALE_REGISTRY[locale].messages)
    }
  })
})
