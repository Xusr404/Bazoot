import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALLOWED_TYPES, extensionForType } from '../src/uploads/uploadRoute.js'

describe('extensionForType', () => {
  it('maps allowed media types to an extension', () => {
    assert.equal(extensionForType('image/png'), 'png')
    assert.equal(extensionForType('image/jpeg'), 'jpg')
    assert.equal(extensionForType('video/mp4'), 'mp4')
    assert.equal(extensionForType('audio/mpeg'), 'mp3')
  })

  it('ignores charset/parameters and casing', () => {
    assert.equal(extensionForType('IMAGE/PNG'), 'png')
    assert.equal(extensionForType('image/png; charset=binary'), 'png')
    assert.equal(extensionForType('  image/webp  '), 'webp')
  })

  it('rejects anything outside the allowlist', () => {
    assert.equal(extensionForType('text/html'), null)
    assert.equal(extensionForType('application/javascript'), null)
    assert.equal(extensionForType(''), null)
    assert.equal(extensionForType(undefined), null)
  })

  it('only allows image, video, and audio types', () => {
    for (const type of Object.keys(ALLOWED_TYPES)) {
      assert.match(type, /^(image|video|audio)\//)
    }
  })
})
