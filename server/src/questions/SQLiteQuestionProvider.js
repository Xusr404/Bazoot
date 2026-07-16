import fs from 'node:fs/promises'
import path from 'node:path'
import { GameError } from '../utils/errors.js'
import { QuestionProvider } from './QuestionProvider.js'

export class SQLiteQuestionProvider extends QuestionProvider {
  // legacyDir: path to the old quizzes/ folder — used once to import existing JSON
  // files on first use per org, then ignored.
  constructor({ db, legacyDir = null }) {
    super()
    this.db = db
    this.legacyDir = legacyDir
    this._migrated = new Set()
  }

  isWritable() {
    return true
  }

  sanitizeId(id) {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(id)) {
      throw new GameError('Invalid quiz id')
    }
    return id
  }

  sanitizeOrganizationId(organizationId) {
    if (typeof organizationId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(organizationId)) {
      throw new GameError('Invalid organization id')
    }
    return organizationId
  }

  async listQuizzes(organizationId) {
    return this.db
      .prepare('SELECT id, subject, questions FROM quizzes WHERE organization_id = $org_id')
      .all({ org_id: organizationId })
      .map((row) => ({
        id: row.id,
        subject: row.subject,
        questions: JSON.parse(row.questions),
      }))
  }

  async getQuestions(organizationId, quizzId) {
    const row = this.db
      .prepare('SELECT id, subject, questions FROM quizzes WHERE id = $id AND organization_id = $org_id')
      .get({ id: quizzId, org_id: organizationId })

    if (!row) return undefined

    return {
      id: row.id,
      subject: row.subject,
      questions: JSON.parse(row.questions),
    }
  }

  async saveQuizz(organizationId, quizzId, quizz) {
    const id = this.sanitizeId(quizzId)
    const orgId = this.sanitizeOrganizationId(organizationId)
    const { id: _ignored, ...data } = quizz
    const now = new Date().toISOString()

    const existing = this.db
      .prepare('SELECT created_at FROM quizzes WHERE id = $id AND organization_id = $org_id')
      .get({ id, org_id: orgId })

    this.db.prepare(`
      INSERT OR REPLACE INTO quizzes (id, organization_id, subject, questions, created_at, updated_at)
      VALUES ($id, $org_id, $subject, $questions, $created_at, $updated_at)
    `).run({
      id,
      org_id: orgId,
      subject: data.subject ?? '',
      questions: JSON.stringify(data.questions ?? []),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    })
  }

  async deleteQuizz(organizationId, quizzId) {
    const id = this.sanitizeId(quizzId)
    const orgId = this.sanitizeOrganizationId(organizationId)

    const result = this.db
      .prepare('DELETE FROM quizzes WHERE id = $id AND organization_id = $org_id')
      .run({ id, org_id: orgId })

    if (result.changes === 0) {
      throw new GameError('Quizz not found')
    }
  }

  async ensureWorkspace(_organizationId) {}

  async migrateLegacyQuizzes(organizationId) {
    if (!this.legacyDir || this._migrated.has(organizationId)) return
    this._migrated.add(organizationId)

    const existing = this.db
      .prepare('SELECT COUNT(*) as count FROM quizzes WHERE organization_id = $org_id')
      .get({ org_id: organizationId })

    if (existing.count > 0) return

    // Try per-org subdirectory first (StaticQuestionProvider layout), then root
    const candidates = [
      path.join(this.legacyDir, organizationId),
      this.legacyDir,
    ]

    for (const dir of candidates) {
      let files
      try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
      } catch {
        continue
      }

      for (const file of files) {
        try {
          const raw = JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8'))
          const quizzId = file.replace(/\.json$/, '')
          if (!/^[a-z0-9_-]{1,64}$/.test(quizzId)) continue
          await this.saveQuizz(organizationId, quizzId, raw)
        } catch (err) {
          console.error(`Skipping unreadable legacy quiz ${file}:`, err.message)
        }
      }

      if (files.length > 0) break
    }
  }

  async deleteWorkspace(organizationId) {
    this.db
      .prepare('DELETE FROM quizzes WHERE organization_id = $org_id')
      .run({ org_id: organizationId })
  }
}
