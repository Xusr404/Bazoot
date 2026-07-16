import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AVATARS,
  defaultAvatarFor,
  isValidAvatar,
  resolveAvatar,
} from '@bazoot/shared/avatars'
import {
  NICKNAME_ADJECTIVES,
  NICKNAME_NOUNS,
  randomNickname,
} from '@bazoot/shared/nicknames'
import {
  REACTIONS,
  REACTION_MAX_BURST,
  allowReaction,
  isValidReaction,
} from '@bazoot/shared/reactions'
import { USERNAME_MAX, USERNAME_MIN, validateUsername } from '@bazoot/shared/validation'

describe('avatars', () => {
  it('validates only members of the curated set', () => {
    assert.equal(isValidAvatar(AVATARS[0]), true)
    assert.equal(isValidAvatar('🙈'), false)
    assert.equal(isValidAvatar(''), false)
    assert.equal(isValidAvatar(undefined), false)
  })

  it('defaultAvatarFor is deterministic and always valid', () => {
    assert.equal(defaultAvatarFor('client-123'), defaultAvatarFor('client-123'))
    assert.equal(isValidAvatar(defaultAvatarFor('client-123')), true)
    assert.equal(isValidAvatar(defaultAvatarFor('')), true)
  })

  it('resolveAvatar keeps a valid choice, else falls back by stable seed', () => {
    const chosen = AVATARS[3]
    assert.equal(resolveAvatar({ avatar: chosen, clientId: 'c1' }), chosen)
    assert.equal(resolveAvatar({ avatar: 'bogus', clientId: 'c1' }), defaultAvatarFor('c1'))
    assert.equal(resolveAvatar({ clientId: 'c1' }), defaultAvatarFor('c1'))
    assert.equal(isValidAvatar(resolveAvatar({})), true)
  })
})

describe('nicknames', () => {
  it('every adjective+noun combination is a valid username length', () => {
    for (const adjective of NICKNAME_ADJECTIVES) {
      for (const noun of NICKNAME_NOUNS) {
        const name = `${adjective}${noun}`
        assert.ok(name.length >= USERNAME_MIN && name.length <= USERNAME_MAX, name)
      }
    }
  })

  it('randomNickname always passes username validation', () => {
    for (let i = 0; i < 50; i += 1) {
      assert.equal(validateUsername(randomNickname()).ok, true)
    }
  })
})

describe('reactions', () => {
  it('validates only members of the curated set', () => {
    assert.equal(isValidReaction(REACTIONS[0]), true)
    assert.equal(isValidReaction('💩'), false)
    assert.equal(isValidReaction(42), false)
  })

  it('allowReaction permits a burst then blocks until the window rolls', () => {
    let timestamps = []
    const now = 1000

    for (let i = 0; i < REACTION_MAX_BURST; i += 1) {
      const result = allowReaction(timestamps, now)
      assert.equal(result.allowed, true)
      timestamps = result.timestamps
    }

    // One past the burst within the same window is blocked.
    const blocked = allowReaction(timestamps, now)
    assert.equal(blocked.allowed, false)

    // After the window passes, reactions flow again and stale stamps are dropped.
    const later = allowReaction(timestamps, now + 5000)
    assert.equal(later.allowed, true)
    assert.equal(later.timestamps.length, 1)
  })
})
