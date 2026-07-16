import { QuestionProvider } from './QuestionProvider.js'

// Quiz source backed by a remote HTTP API. Slot in via createGameServer
// ({ questionProvider: new APIQuestionProvider({ baseUrl }) }) — GameEngine
// never knows the difference (Phase 9A).
//
// Expected endpoints (adapt `mapQuiz` for other shapes):
//   GET {baseUrl}/quizzes            → [{ id, subject, questions }]
//   GET {baseUrl}/quizzes/{quizzId}  → { id, subject, questions }
export class APIQuestionProvider extends QuestionProvider {
  constructor({ baseUrl, headers = {}, mapQuiz = (quiz) => quiz }) {
    super()
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.headers = headers
    this.mapQuiz = mapQuiz
  }

  async listQuizzes(organizationId) {
    const response = await fetch(
      `${this.baseUrl}/organizations/${encodeURIComponent(organizationId)}/quizzes`,
      { headers: this.headers },
    )

    if (!response.ok) {
      console.error(`Quiz API list failed: ${response.status}`)

      return []
    }

    const quizzes = await response.json()

    return quizzes.map(this.mapQuiz)
  }

  async getQuestions(organizationId, quizzId) {
    const response = await fetch(
      `${this.baseUrl}/organizations/${encodeURIComponent(organizationId)}/quizzes/${encodeURIComponent(quizzId)}`,
      { headers: this.headers },
    )

    if (!response.ok) {
      return undefined
    }

    return this.mapQuiz(await response.json())
  }
}
