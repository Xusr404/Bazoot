import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hasFieldError } from '../src/utils/formErrors.js'

describe('hasFieldError', () => {
  it('maps server conflicts to their affected fields', () => {
    assert.equal(hasFieldError('This username is already taken', 'username'), true)
    assert.equal(hasFieldError('This email is already in use', 'email'), true)
    assert.equal(hasFieldError('Organization name must be 2–80 characters', 'organization'), true)
    assert.equal(hasFieldError('Quiz title is required', 'subject'), true)
    assert.equal(hasFieldError('Account not found', 'identifier'), true)
  })

  it('maps combined credential errors to both credential fields', () => {
    const message = 'Invalid username or password'

    assert.equal(hasFieldError(message, 'username'), true)
    assert.equal(hasFieldError(message, 'password'), true)
  })

  it('does not mark unrelated fields', () => {
    assert.equal(hasFieldError('This username is already taken', 'email'), false)
    assert.equal(hasFieldError('Too many attempts — wait a moment and try again', 'password'), false)
  })
})
