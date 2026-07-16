import fs from 'node:fs/promises'
import path from 'node:path'
import { GameError } from '../utils/errors.js'
import { QuestionProvider } from './QuestionProvider.js'

// Default provider: quiz JSON files on disk, one file per quiz, same schema as
// the source app's config/quizz/*.json. The file name (sans .json) is the quiz id.
export class StaticQuestionProvider extends QuestionProvider {
  constructor({ quizzesDir }) {
    super()
    this.quizzesDir = quizzesDir
    this.legacyMigration = null
  }

  sanitizeOrganizationId(organizationId) {
    if (typeof organizationId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(organizationId)) {
      throw new GameError('Invalid organization id')
    }

    return organizationId
  }

  workspaceDir(organizationId) {
    return path.join(this.quizzesDir, this.sanitizeOrganizationId(organizationId))
  }

  async ensureWorkspace(organizationId) {
    const directory = this.workspaceDir(organizationId)
    await fs.mkdir(directory, { recursive: true })
  }

  async migrateLegacyQuizzes(organizationId) {
    if (!this.legacyMigration) {
      this.legacyMigration = (async () => {
        const directory = this.workspaceDir(organizationId)
        await fs.mkdir(directory, { recursive: true })
        let files = []

        try {
          files = await fs.readdir(this.quizzesDir, { withFileTypes: true })
        } catch {
          return
        }

        for (const file of files.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))) {
          const source = path.join(this.quizzesDir, file.name)
          const destination = path.join(directory, file.name)

          try {
            await fs.rename(source, destination)
          } catch (error) {
            if (error.code !== 'EXDEV') {
              throw error
            }

            await fs.copyFile(source, destination)
            await fs.unlink(source)
          }
        }
      })()
    }

    await this.legacyMigration
  }

  async listQuizzes(organizationId) {
    await this.ensureWorkspace(organizationId)
    let files

    try {
      files = await fs.readdir(this.workspaceDir(organizationId))
    } catch {
      return []
    }

    const quizzes = []

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.workspaceDir(organizationId), file), 'utf-8')
        quizzes.push({ id: file.replace(/\.json$/, ''), ...JSON.parse(raw) })
      } catch (error) {
        console.error(`Skipping unreadable quiz file ${file}:`, error.message)
      }
    }

    return quizzes
  }

  async getQuestions(organizationId, quizzId) {
    const quizzes = await this.listQuizzes(organizationId)

    return quizzes.find((q) => q.id === quizzId)
  }

  isWritable() {
    return true
  }

  /** File name = quiz id; restricted charset so ids can never escape the dir. */
  sanitizeId(quizzId) {
    if (typeof quizzId !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(quizzId)) {
      throw new GameError('Invalid quizz id')
    }

    return quizzId
  }

  async saveQuizz(organizationId, quizzId, quizz) {
    const id = this.sanitizeId(quizzId)
    const { id: _ignored, ...data } = quizz
    const directory = this.workspaceDir(organizationId)

    await this.ensureWorkspace(organizationId)
    await fs.writeFile(
      path.join(directory, `${id}.json`),
      JSON.stringify(data, null, 2),
    )
  }

  async deleteQuizz(organizationId, quizzId) {
    const id = this.sanitizeId(quizzId)

    try {
      await fs.unlink(path.join(this.workspaceDir(organizationId), `${id}.json`))
    } catch {
      throw new GameError('Quizz not found')
    }
  }

  async deleteWorkspace(organizationId) {
    await fs.rm(this.workspaceDir(organizationId), { recursive: true, force: true })
  }
}
