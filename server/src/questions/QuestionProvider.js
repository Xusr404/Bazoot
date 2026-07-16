import { GameError } from '../utils/errors.js'

// Question source abstraction (Phase 9A). GameEngine consumes quiz data through
// this interface and never knows where questions come from. Write support is
// optional — the quiz editor is only offered for writable providers.
/* eslint-disable no-unused-vars */
export class QuestionProvider {
  /** Does this source support the quiz editor (create/update/delete)? */
  isWritable() {
    return false
  }

  /** Persist a quiz under the given id (overwrites). */
  async saveQuizz(organizationId, quizzId, quizz) {
    throw new GameError('This question source does not support editing')
  }

  /** Remove a quiz. */
  async deleteQuizz(organizationId, quizzId) {
    throw new GameError('This question source does not support editing')
  }

  /** @returns {Promise<Array<{ id: string, subject: string, questions: Array }>>} */
  async listQuizzes(organizationId) {
    throw new Error('Not implemented')
  }

  /**
   * @param {string} quizzId
   * @returns {Promise<{ id: string, subject: string, questions: Array<{
   *   question: string, answers: string[], image?: string, video?: string,
   *   audio?: string, solution: number, cooldown: number, time: number
   * }> } | undefined>}
   */
  async getQuestions(organizationId, quizzId) {
    throw new Error('Not implemented')
  }

  async ensureWorkspace(organizationId) {}

  async migrateLegacyQuizzes(organizationId) {}

  async deleteWorkspace(organizationId) {}
}
