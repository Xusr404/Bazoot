import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'

// Question-media uploads. Managers POST a raw file body to /uploads; the file is
// streamed to disk under a random name and served back at /uploads/<name>. The
// quiz only ever stores that relative path (see shared/quizValidation.js, which
// accepts /uploads/* alongside external http(s) URLs). Auth mirrors the socket
// layer: a valid manager session token (Bearer) is required to write.

// MIME → extension allowlist. The key set is also the type guard — anything not
// listed is rejected with 415 so the endpoint can't be used to host arbitrary
// files (scripts, html, …).
export const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'weba',
}

/** File extension for an allowed upload content-type, or null if not allowed. */
export const extensionForType = (contentType) => {
  const type = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()

  return ALLOWED_TYPES[type] ?? null
}

const bearerToken = (header) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '')

  return match ? match[1].trim() : null
}

const MEDIA_TYPE_BY_EXTENSION = {
  png: 'image', jpg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image',
  mp4: 'video', webm: 'video', ogv: 'video',
  mp3: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', wav: 'audio', weba: 'audio',
}

const mediaAssetForName = async (uploadsDir, name, urlBase = '/uploads') => {
  const extension = path.extname(name).slice(1).toLowerCase()
  const type = MEDIA_TYPE_BY_EXTENSION[extension]

  if (!type) {
    return null
  }

  const info = await stat(path.join(uploadsDir, name))

  if (!info.isFile()) {
    return null
  }

  return { name, type, url: `${urlBase}/${name}`, updatedAt: info.mtime.toISOString() }
}

import { rateLimit } from 'express-rate-limit'

// Mounts GET /uploads/* (static serving) and POST /uploads (authenticated
// upload) on the given Express app.
export const registerUploadRoutes = (app, { accountService, env }) => {
  const uploadsRoot = env.uploadsDir
  const maxBytes = env.uploadMaxBytes

  // Best-effort: both serving and saving need the directory to exist.
  mkdir(uploadsRoot, { recursive: true }).catch(() => {})

  // New media is partitioned by workspace. With no workspace header, retain the
  // old shared directory so existing clients and already-stored URLs still work.
  const uploadsDirFor = async (req, username) => {
    const organizationId = String(req.headers['x-organization-id'] ?? '').trim()

    if (!organizationId || typeof accountService.organizationContext !== 'function') {
      return uploadsRoot
    }

    const context = await accountService.organizationContext(username, organizationId, { strict: true })

    if (!context.organization) {
      throw new Error('Workspace not found')
    }

    return path.join(uploadsRoot, context.organization.id)
  }

  // A shared, manager-only media library. Files remain opaque random names, but
  // returning the newest assets lets authors reuse them across questions/quizzes.
  // Register before the static middleware so /uploads is an API endpoint, while
  // /uploads/<name> continues to serve the actual media.
  app.get('/uploads', async (req, res) => {
    const username = accountService.resume(bearerToken(req.headers.authorization))

    if (!username) {
      res.status(401).json({ error: 'Not authenticated' })

      return
    }

    try {
      const uploadsDir = await uploadsDirFor(req, username)
      const names = await readdir(uploadsDir)
      const relativeDir = path.relative(uploadsRoot, uploadsDir).split(path.sep).join('/')
      const urlBase = relativeDir ? `/uploads/${relativeDir}` : '/uploads'
      const items = (await Promise.all(names.map((name) => mediaAssetForName(uploadsDir, name, urlBase)))).filter(Boolean)

      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      res.json({ items: items.slice(0, 24) })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.json({ items: [] })

        return
      }

      res.status(403).json({ error: 'Workspace access denied' })
    }
  })

  // Random, content-unique names → safe to cache hard.
  app.use(
    '/uploads',
    express.static(uploadsRoot, {
      index: false,
      maxAge: '7d',
      setHeaders: (res) => {
        // Uploaded files are attacker-controllable content (e.g. an SVG can carry
        // <script>). nosniff stops MIME confusion, but a directly-navigated SVG
        // would still execute in this origin — so we also sandbox the response
        // (no scripts), forbid framing, and force download on top-level nav.
        // Inline <img>/<video>/<audio> still work: subresource loads ignore
        // Content-Disposition, and <img>-loaded SVGs are already script-inert.
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
        res.setHeader('X-Frame-Options', 'DENY')
        res.setHeader('Content-Disposition', 'attachment')
      },
    }),
  )

  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 20, // 20 uploads per minute per IP
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  })

  app.post('/uploads', uploadLimiter, async (req, res) => {
    const username = accountService.resume(bearerToken(req.headers.authorization))

    if (!username) {
      res.status(401).json({ error: 'Not authenticated' })

      return
    }

    let uploadsDir
    try {
      uploadsDir = await uploadsDirFor(req, username)
      await mkdir(uploadsDir, { recursive: true })
    } catch {
      res.status(403).json({ error: 'Workspace access denied' })

      return
    }

    const ext = extensionForType(req.headers['content-type'])

    if (!ext) {
      res.status(415).json({ error: 'Unsupported media type' })

      return
    }

    const name = `${crypto.randomUUID()}.${ext}`
    const filePath = path.join(uploadsDir, name)
    const url = `/uploads/${path.relative(uploadsRoot, filePath).split(path.sep).join('/')}`
    const out = createWriteStream(filePath)
    let bytes = 0
    let settled = false

    // Stop on the first problem: unpipe, drop the partial file, answer once.
    const fail = (status, message) => {
      if (settled) {
        return
      }

      settled = true
      req.unpipe(out)
      out.destroy()
      unlink(filePath).catch(() => {})

      if (!res.headersSent) {
        res.status(status).json({ error: message })
      }

      req.destroy()
    }

    req.on('data', (chunk) => {
      bytes += chunk.length

      if (bytes > maxBytes) {
        fail(413, 'File is too large')
      }
    })
    req.on('error', () => fail(400, 'Upload failed'))
    req.on('aborted', () => fail(400, 'Upload aborted'))
    out.on('error', () => fail(500, 'Could not store the file'))
    out.on('finish', () => {
      if (settled) {
        return
      }

      settled = true
      res.status(201).json({ url })
    })

    req.pipe(out)
  })
}
