import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { env as baseEnv } from '../src/config/env.js'
import { createGameServer } from '../src/index.js'

// End-to-end coverage of the upload HTTP route against a real Express server,
// with a stub account service so a known token authenticates.
describe('upload route (integration)', () => {
  let server
  let base
  let uploadsDir

  const post = (body, { token, type = 'image/png' } = {}) =>
    fetch(`${base}/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': type,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    })

  before(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'bazoot-uploads-'))
    const env = { ...baseEnv, uploadsDir, uploadMaxBytes: 1024 }
    const accountService = { resume: (token) => (token === 'good-token' ? 'tester' : null) }

    server = await createGameServer({ env, accountService })
    await new Promise((resolve) => server.httpServer.listen(0, resolve))
    base = `http://127.0.0.1:${server.httpServer.address().port}`
  })

  after(async () => {
    await server.close()
    await rm(uploadsDir, { recursive: true, force: true })
  })

  it('rejects unauthenticated uploads with 401', async () => {
    const res = await post(Buffer.from('x'))
    assert.equal(res.status, 401)
  })

  it('rejects disallowed media types with 415', async () => {
    const res = await post(Buffer.from('<h1>'), { token: 'good-token', type: 'text/html' })
    assert.equal(res.status, 415)
  })

  it('stores an authenticated upload and serves it back', async () => {
    const payload = Buffer.from('the-bytes')
    const res = await post(payload, { token: 'good-token' })
    assert.equal(res.status, 201)

    const { url } = await res.json()
    assert.match(url, /^\/uploads\/[\w-]+\.png$/)

    const served = await fetch(`${base}${url}`)
    assert.equal(served.status, 200)
    assert.equal(Buffer.from(await served.arrayBuffer()).toString(), 'the-bytes')

    // E1: served uploads must neutralise active content (SVG/HTML XSS).
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(served.headers.get('content-security-policy'), "default-src 'none'; sandbox")
    assert.equal(served.headers.get('x-frame-options'), 'DENY')
    assert.equal(served.headers.get('content-disposition'), 'attachment')
  })

  it('lists recent media only for authenticated managers', async () => {
    const denied = await fetch(`${base}/uploads`)
    assert.equal(denied.status, 401)

    const res = await fetch(`${base}/uploads`, {
      headers: { Authorization: 'Bearer good-token' },
    })
    assert.equal(res.status, 200)

    const { items } = await res.json()
    assert.ok(items.some((item) => item.type === 'image' && /^\/uploads\/.+\.png$/.test(item.url)))
  })

  it('serves baseline security headers on every response', async () => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(res.headers.get('x-powered-by'), null)
  })

  it('does not store a file that exceeds the size limit', async () => {
    // maxBytes is 1024 for this server; 4 KB must not yield a 201.
    let status = 0
    try {
      status = (await post(Buffer.alloc(4096, 1), { token: 'good-token' })).status
    } catch {
      status = 0 // connection reset on abort is acceptable — just not a success
    }
    assert.notEqual(status, 201)
  })
})
