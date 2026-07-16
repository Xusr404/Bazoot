import { solutionOrderOf } from '@bazoot/shared/answers'
import { QUESTION_TYPES, questionTypeOf } from '@bazoot/shared/questionTypes'

// Simulated players for the demo run. Pure answer planning — unit-tested in
// client/test/demoEngine.test.js.

export const DEMO_BOTS = [
  { id: 'demo-bot-ada', username: 'Ada (bot)', accuracy: 0.85 },
  { id: 'demo-bot-leo', username: 'Leo (bot)', accuracy: 0.6 },
  { id: 'demo-bot-mia', username: 'Mia (bot)', accuracy: 0.35 },
]

/** The answer payload the engine would mark correct (displayed indices). */
export const correctAnswerKey = (question, displayOrder) => {
  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI:
      return [...question.solution]

    case QUESTION_TYPES.ORDER:
      return solutionOrderOf(question).map((original) => displayOrder.indexOf(original))

    default:
      return question.solution
  }
}

const randomIndex = (count, rng) => Math.floor(rng() * count)

/** A structurally valid but incorrect answer payload. */
export const wrongAnswerKey = (question, displayOrder, rng = Math.random) => {
  const count = question.answers.length

  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI: {
      const solutions = new Set(question.solution)
      // Toggle one membership relative to the correct set — guaranteed wrong,
      // and never empty (drop only when more than one solution remains).
      const flip = randomIndex(count, rng)

      if (solutions.has(flip) && solutions.size > 1) {
        solutions.delete(flip)
      } else if (!solutions.has(flip)) {
        solutions.add(flip)
      } else {
        solutions.add((flip + 1) % count)
      }

      return [...solutions].sort((a, b) => a - b)
    }

    case QUESTION_TYPES.ORDER: {
      const correct = correctAnswerKey(question, displayOrder)
      const shuffled = [...correct]

      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = randomIndex(i + 1, rng)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      if (shuffled.every((value, i) => value === correct[i])) {
        ;[shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
      }

      return shuffled
    }

    default: {
      const wrong = randomIndex(count, rng)

      return wrong === question.solution ? (wrong + 1) % count : wrong
    }
  }
}

/** What a bot with the given accuracy submits for this question. */
export const planBotAnswer = (question, displayOrder, accuracy, rng = Math.random) =>
  rng() < accuracy
    ? correctAnswerKey(question, displayOrder)
    : wrongAnswerKey(question, displayOrder, rng)
