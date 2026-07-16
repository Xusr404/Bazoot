import { QUESTION_TYPES, questionTypeOf } from './questionTypes.js'

// Type-aware answer logic: payload validation, correctness, reveal tallying,
// and the display shuffle for ordering questions. Pure functions shared by the
// server GameEngine and the client demo run — unit-tested in
// server/test/answers.test.js.

/** Correct sequence of ORIGINAL answer indices (authored order by default). */
export const solutionOrderOf = (question) =>
  question.solution ?? question.answers.map((_, i) => i)

/** Random display permutation for an order question: displayOrder[displayed] = original. */
export const createDisplayOrder = (count) => {
  const order = Array.from({ length: count }, (_, i) => i)

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  return order
}

const isIndex = (value, count) => Number.isInteger(value) && value >= 0 && value < count

/** Is the submitted answer payload structurally valid for this question type? */
export const isValidAnswerPayload = (question, answerKey) => {
  const count = question.answers.length

  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI:
      return (
        Array.isArray(answerKey) &&
        answerKey.length > 0 &&
        new Set(answerKey).size === answerKey.length &&
        answerKey.every((key) => isIndex(key, count))
      )

    case QUESTION_TYPES.ORDER:
      return (
        Array.isArray(answerKey) &&
        answerKey.length === count &&
        new Set(answerKey).size === count &&
        answerKey.every((key) => isIndex(key, count))
      )

    default:
      return isIndex(answerKey, count)
  }
}

/**
 * Is a recorded answer correct?
 * `displayOrder` is required for order questions (maps displayed → original).
 */
export const checkAnswer = ({ question, answerId, displayOrder }) => {
  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI: {
      if (!Array.isArray(answerId)) {
        return false
      }

      const solutions = new Set(question.solution)

      return answerId.length === solutions.size && answerId.every((key) => solutions.has(key))
    }

    case QUESTION_TYPES.ORDER: {
      if (!Array.isArray(answerId)) {
        return false
      }

      const solutionOrder = solutionOrderOf(question)

      return answerId.every((displayed, pos) => displayOrder[displayed] === solutionOrder[pos])
    }

    default:
      return answerId === question.solution
  }
}

/**
 * Reveal bar-chart counts per (displayed) answer index.
 * single/trueFalse: votes per answer. multi: selections per answer.
 * order: players who placed that answer in its correct position.
 */
export const tallyResponses = ({ question, playersAnswers, displayOrder }) => {
  const totals = {}
  const add = (key) => {
    totals[key] = (totals[key] || 0) + 1
  }

  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI:
      for (const { answerId } of playersAnswers) {
        for (const key of answerId ?? []) {
          add(key)
        }
      }
      break

    case QUESTION_TYPES.ORDER: {
      const solutionOrder = solutionOrderOf(question)

      for (const { answerId } of playersAnswers) {
        ;(answerId ?? []).forEach((displayed, pos) => {
          if (displayOrder[displayed] === solutionOrder[pos]) {
            add(displayed)
          }
        })
      }
      break
    }

    default:
      for (const { answerId } of playersAnswers) {
        add(answerId)
      }
  }

  return totals
}

/**
 * The `correct` payload for the manager reveal:
 * single/trueFalse → index; multi → indices; order → the correct sequence of
 * DISPLAYED indices (what the players actually saw).
 */
export const correctForReveal = ({ question, displayOrder }) => {
  switch (questionTypeOf(question)) {
    case QUESTION_TYPES.MULTI:
      return question.solution

    case QUESTION_TYPES.ORDER:
      return solutionOrderOf(question).map((original) => displayOrder.indexOf(original))

    default:
      return question.solution
  }
}
