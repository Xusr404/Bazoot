import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { env as baseEnv } from '../src/config/env.js'
import { createGameServer } from '../src/index.js'

describe('static client serving', () => {
  let server
  let base
  let tempDir

  before(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'bazoot-client-'))
    const clientDistDir = path.join(tempDir, 'dist')
    const uploadsDir = path.join(tempDir, 'uploads')

    await mkdir(path.join(clientDistDir, 'assets'), { recursive: true })
    await writeFile(
      path.join(clientDistDir, 'index.html'),
      '<!doctype html><div id="root">Bazoot</div>',
    )
    await writeFile(path.join(clientDistDir, 'assets', 'app.js'), 'console.log("bazoot")')

    server = await createGameServer({
      env: {
        ...baseEnv,
        databaseFile: ':memory:',
        clientDistDir,
        uploadsDir,
      },
      accountService: { resume: () => null },
    })
    await new Promise((resolve) => server.httpServer.listen(0, resolve))
    base = `http://127.0.0.1:${server.httpServer.address().port}`
  })

  after(async () => {
    await server.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('serves built assets with SPA security headers', async () => {
    const res = await fetch(`${base}/assets/app.js`)

    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'console.log("bazoot")')
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })

  it('falls back to index.html for client routes', async () => {
    const res = await fetch(`${base}/manager/settings`, {
      headers: { Accept: 'text/html' },
    })

    assert.equal(res.status, 200)
    assert.equal(await res.text(), '<!doctype html><div id="root">Bazoot</div>')
    assert.match(res.headers.get('content-security-policy'), /connect-src 'self' ws: wss:/)
  })

  it('does not serve index.html for non-browser misses', async () => {
    const res = await fetch(`${base}/missing.js`)

    assert.equal(res.status, 404)
  })
})
