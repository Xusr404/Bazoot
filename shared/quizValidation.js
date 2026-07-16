import { QUESTION_TYPES, questionTypeOf } from './questionTypes.js'

// Quiz validation shared by the editor UI (instant feedback) and the server
// (authoritative check before persisting). `collectQuizzIssues` returns every
// problem with a structured path so the editor can show errors next to the
// relevant field; `validateQuizz`/`validateQuestion` keep the original
// first-problem API (and exact messages) for the server and existing callers.

const SUBJECT_MAX = 100
const QUESTION_TEXT_MAX = 300
const ANSWER_TEXT_MAX = 150
const MAX_QUESTIONS = 100
const MIN_ANSWERS = 2
const MAX_ANSWERS = 6
const COOLDOWN_RANGE = [1, 60]
const TIME_RANGE = [3, 300]

// Bounds the editor needs for input attributes, counters, and hints.
export const QUIZ_LIMITS = {
  subjectMax: SUBJECT_MAX,
  questionTextMax: QUESTION_TEXT_MAX,
  answerTextMax: ANSWER_TEXT_MAX,
  maxQuestions: MAX_QUESTIONS,
  minAnswers: MIN_ANSWERS,
  maxAnswers: MAX_ANSWERS,
  cooldownRange: COOLDOWN_RANGE,
  timeRange: TIME_RANGE,
}

const isIntInRange = (value, [min, max]) =>
  Number.isInteger(value) && value >= min && value <= max

// Media may be an external http(s) URL or a server-relative upload path
// (/uploads/<name>, produced by the upload endpoint).
const isOptionalUrl = (value) =>
  value === undefined ||
  value === '' ||
  (typeof value === 'string' && (/^https?:\/\//.test(value) || value.startsWith('/uploads/')))

const fail = (message) => ({ ok: false, message })

/**
 * Every problem in one question, in check order. Messages are unprefixed;
 * `field` names the editor input at fault: 'text' | 'answers' | 'answer'
 * (with `answerIndex`) | 'cooldown' | 'time' | 'media' | 'solution' | 'type'.
 * @returns {Array<{ field: string, answerIndex?: number, message: string }>}
 */
export const collectQuestionIssues = (question) => {
  const issues = []
  const push = (field, message, extra) => issues.push({ field, message, ...extra })

  if (typeof question.question !== 'string' || question.question.trim().length === 0) {
    push('text', 'text is required')
  } else if (question.question.length > QUESTION_TEXT_MAX) {
    push('text', `text exceeds ${QUESTION_TEXT_MAX} characters`)
  }

  const answers = Array.isArray(question.answers) ? question.answers : null

  if (!answers || answers.length < MIN_ANSWERS || answers.length > MAX_ANSWERS) {
    push('answers', `needs ${MIN_ANSWERS} to ${MAX_ANSWERS} answers`)
  }

  for (const [index, answer] of (answers ?? []).entries()) {
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      push('answer', 'every answer needs text', { answerIndex: index })
    } else if (answer.length > ANSWER_TEXT_MAX) {
      push('answer', `an answer exceeds ${ANSWER_TEXT_MAX} characters`, { answerIndex: index })
    }
  }

  if (!isIntInRange(question.cooldown, COOLDOWN_RANGE)) {
    push('cooldown', `cooldown must be ${COOLDOWN_RANGE[0]}–${COOLDOWN_RANGE[1]} seconds`)
  }

  if (!isIntInRange(question.time, TIME_RANGE)) {
    push('time', `time must be ${TIME_RANGE[0]}–${TIME_RANGE[1]} seconds`)
  }

  if (!isOptionalUrl(question.image) || !isOptionalUrl(question.video) || !isOptionalUrl(question.audio)) {
    push('media', 'media must be an http(s) URL or an uploaded file')
  }

  const count = answers?.length ?? 0
  const type = questionTypeOf(question)

  switch (type) {
    case QUESTION_TYPES.SINGLE:
      if (!isIntInRange(question.solution, [0, count - 1])) {
        push('solution', 'pick the correct answer')
      }
      break

    case QUESTION_TYPES.TRUE_FALSE:
      if (count !== 2) {
        push('answers', 'true/false needs exactly 2 answers')
      } else if (!isIntInRange(question.solution, [0, 1])) {
        push('solution', 'pick true or false')
      }
      break

    case QUESTION_TYPES.MULTI: {
      const solutions = question.solution

      if (!Array.isArray(solutions) || solutions.length === 0) {
        push('solution', 'pick at least one correct answer')
      } else if (
        new Set(solutions).size !== solutions.length ||
        !solutions.every((s) => isIntInRange(s, [0, count - 1]))
      ) {
        push('solution', 'correct answers are invalid')
      }
      break
    }

    case QUESTION_TYPES.ORDER: {
      // Authored order is the correct order; an explicit solution (a permutation
      // of 0..n-1) may override it for hand-written files.
      const solution = question.solution

      if (solution !== undefined) {
        const valid =
          Array.isArray(solution) &&
          solution.length === count &&
          [...solution].sort((a, b) => a - b).every((value, i) => value === i)

        if (!valid) {
          push('solution', 'order solution must use each answer exactly once')
        }
      }
      break
    }

    default:
      push('type', `unknown question type "${type}"`)
  }

  return issues
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateQuestion = (question, index) => {
  const [first] = collectQuestionIssues(question)

  return first ? fail(`Question ${index + 1}: ${first.message}`) : { ok: true }
}

/**
 * Every problem in the whole quiz, in check order. Quiz-level issues carry no
 * `questionIndex`; question-level issues do, plus the question's `field`.
 * @returns {Array<{ field: string, questionIndex?: number, answerIndex?: number, message: string }>}
 */
export const collectQuizzIssues = (quizz) => {
  if (!quizz || typeof quizz !== 'object') {
    return [{ field: 'quizz', message: 'Quizz data is missing' }]
  }

  const issues = []

  if (typeof quizz.subject !== 'string' || quizz.subject.trim().length === 0) {
    issues.push({ field: 'subject', message: 'Subject is required' })
  } else if (quizz.subject.length > SUBJECT_MAX) {
    issues.push({ field: 'subject', message: `Subject exceeds ${SUBJECT_MAX} characters` })
  }

  if (!Array.isArray(quizz.questions) || quizz.questions.length === 0) {
    issues.push({ field: 'questions', message: 'At least one question is required' })

    return issues
  }

  if (quizz.questions.length > MAX_QUESTIONS) {
    issues.push({ field: 'questions', message: `No more than ${MAX_QUESTIONS} questions` })
  }

  for (const [questionIndex, question] of quizz.questions.entries()) {
    for (const issue of collectQuestionIssues(question)) {
      issues.push({ ...issue, questionIndex })
    }
  }

  return issues
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateQuizz = (quizz) => {
  const [first] = collectQuizzIssues(quizz)

  if (!first) {
    return { ok: true }
  }

  return fail(
    first.questionIndex === undefined
      ? first.message
      : `Question ${first.questionIndex + 1}: ${first.message}`,
  )
}
