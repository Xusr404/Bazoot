import { QuestionProvider } from './QuestionProvider.js'

// Quiz source backed by any database client (Phase 9A). Database-agnostic:
// inject query functions instead of coupling to a driver.
//
//   new DatabaseQuestionProvider({
//     listAll: () => db.query('SELECT id, subject, questions FROM quizzes'),
//     findById: (id) => db.query('SELECT ... WHERE id = $1', [id]),
//   })
//
// Each row must yield { id, subject, questions } with the questions array in
// the shared quiz schema (question, answers, solution, cooldown, time, media?).
export class DatabaseQuestionProvider extends QuestionProvider {
  constructor({ listAll, findById }) {
    super()
    this.listAll = listAll
    this.findById = findById
  }

  async listQuizzes(organizationId) {
    try {
      return (await this.listAll(organizationId)) ?? []
    } catch (error) {
      console.error('Quiz database list failed:', error)

      return []
    }
  }

  async getQuestions(organizationId, quizzId) {
    try {
      return (await this.findById(quizzId, organizationId)) ?? undefined
    } catch (error) {
      console.error('Quiz database lookup failed:', error)

      return undefined
    }
  }
}
