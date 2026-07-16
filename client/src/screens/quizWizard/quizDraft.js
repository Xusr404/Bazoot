import { QUESTION_TYPES, questionTypeOf } from '@bazoot/shared/questionTypes'
import { QUIZ_LIMITS, collectQuizzIssues } from '@bazoot/shared/quizValidation'
import { ENGINE_TIMING } from '@bazoot/shared/timing'

// Pure draft logic for the quiz wizard: immutable draft mutations, save
// normalisation, validation/warning collection, and summary stats. No React
// imports — node --test exercises this module directly.

export const DEFAULT_COOLDOWN = 5
export const DEFAULT_TIME = 15

// Session-stable id for a draft question — used as its React key and drag
// identity. A monotonic counter guarantees uniqueness even within one tick.
// Never persisted: normalizeForSave rebuilds questions without it.
let questionSeq = 0
export const newQuestionId = () => `q${Date.now().toString(36)}${(questionSeq++).toString(36)}`

export const emptyQuestion = () => ({
  type: QUESTION_TYPES.SINGLE,
  question: '',
  answers: ['', '', '', ''],
  solution: 0,
  cooldown: DEFAULT_COOLDOWN,
  time: DEFAULT_TIME,
  image: '',
  video: '',
  audio: '',
})

/** Editable draft from a stored quiz (or a fresh one-question draft). */
export const createDraft = (initialQuizz) => ({
  subject: initialQuizz?.subject ?? '',
  questions: (initialQuizz?.questions ?? [emptyQuestion()]).map((q) => ({
    ...emptyQuestion(),
    ...q,
    _id: q._id ?? newQuestionId(),
    answers: [...(q.answers ?? emptyQuestion().answers)],
  })),
})

// ── immutable mutations (draft → draft) ─────────────────────────────────────

export const setSubject = (draft, subject) => ({ ...draft, subject })

export const patchQuestion = (draft, index, patch) => ({
  ...draft,
  questions: draft.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
})

export const changeQuestionType = (draft, index, type) => {
  const question = draft.questions[index]
  const patch = { type }

  if (type === QUESTION_TYPES.TRUE_FALSE) {
    patch.answers = ['True', 'False']
    patch.solution = 0
  } else if (type === QUESTION_TYPES.MULTI) {
    patch.solution = []
  } else if (type === QUESTION_TYPES.SINGLE) {
    patch.solution = 0
  } else if (type === QUESTION_TYPES.ORDER) {
    patch.solution = undefined
  }

  if (type !== QUESTION_TYPES.TRUE_FALSE && question.answers.length < QUIZ_LIMITS.minAnswers) {
    patch.answers = ['', '']
  }

  return patchQuestion(draft, index, patch)
}

export const setAnswerText = (draft, questionIndex, answerIndex, text) => {
  const answers = [...draft.questions[questionIndex].answers]
  answers[answerIndex] = text

  return patchQuestion(draft, questionIndex, { answers })
}

export const addAnswer = (draft, questionIndex) => {
  const question = draft.questions[questionIndex]

  if (question.answers.length >= QUIZ_LIMITS.maxAnswers) {
    return draft
  }

  return patchQuestion(draft, questionIndex, { answers: [...question.answers, ''] })
}

export const removeAnswer = (draft, questionIndex, answerIndex) => {
  const question = draft.questions[questionIndex]

  if (question.answers.length <= QUIZ_LIMITS.minAnswers) {
    return draft
  }

  const patch = { answers: question.answers.filter((_, i) => i !== answerIndex) }
  const type = questionTypeOf(question)

  // Keep the correct-answer marker(s) pointing at the same answers.
  if (type === QUESTION_TYPES.SINGLE) {
    patch.solution =
      question.solution === answerIndex
        ? 0
        : question.solution - (question.solution > answerIndex ? 1 : 0)
  } else if (type === QUESTION_TYPES.MULTI) {
    patch.solution = (question.solution ?? [])
      .filter((s) => s !== answerIndex)
      .map((s) => (s > answerIndex ? s - 1 : s))
  }

  return patchQuestion(draft, questionIndex, patch)
}

export const moveAnswer = (draft, questionIndex, answerIndex, direction) => {
  const question = draft.questions[questionIndex]
  const target = answerIndex + direction

  if (target < 0 || target >= question.answers.length) {
    return draft
  }

  const answers = [...question.answers]
  ;[answers[answerIndex], answers[target]] = [answers[target], answers[answerIndex]]

  return patchQuestion(draft, questionIndex, { answers })
}

export const toggleMultiSolution = (draft, questionIndex, answerIndex) => {
  const current = draft.questions[questionIndex].solution ?? []

  return patchQuestion(draft, questionIndex, {
    solution: current.includes(answerIndex)
      ? current.filter((s) => s !== answerIndex)
      : [...current, answerIndex].sort((a, b) => a - b),
  })
}

export const addQuestion = (draft) => {
  if (draft.questions.length >= QUIZ_LIMITS.maxQuestions) {
    return draft
  }

  return { ...draft, questions: [...draft.questions, { ...emptyQuestion(), _id: newQuestionId() }] }
}

export const duplicateQuestion = (draft, index) => {
  if (draft.questions.length >= QUIZ_LIMITS.maxQuestions) {
    return draft
  }

  const source = draft.questions[index]
  const copy = {
    ...source,
    _id: newQuestionId(),
    answers: [...source.answers],
    solution: Array.isArray(source.solution) ? [...source.solution] : source.solution,
  }
  const questions = [...draft.questions]
  questions.splice(index + 1, 0, copy)

  return { ...draft, questions }
}

export const removeQuestion = (draft, index) => {
  if (draft.questions.length <= 1) {
    return draft
  }

  return { ...draft, questions: draft.questions.filter((_, i) => i !== index) }
}

export const moveQuestion = (draft, index, direction) => {
  const target = index + direction

  if (target < 0 || target >= draft.questions.length) {
    return draft
  }

  const questions = [...draft.questions]
  ;[questions[index], questions[target]] = [questions[target], questions[index]]

  return { ...draft, questions }
}

/** Copy one question's timing (reading + answer seconds) onto every question. */
export const applyTimingToAll = (draft, cooldown, time) => ({
  ...draft,
  questions: draft.questions.map((question) => ({ ...question, cooldown, time })),
})

/**
 * Reorder questions to match a list of their ids (from a drag interaction).
 * Ignores a stale/partial id list rather than dropping questions.
 */
export const reorderQuestionsByIds = (draft, ids) => {
  const byId = new Map(draft.questions.map((question) => [question._id, question]))
  const questions = ids.map((id) => byId.get(id)).filter(Boolean)

  if (questions.length !== draft.questions.length) {
    return draft
  }

  return { ...draft, questions }
}

// ── save shape, validation, warnings ────────────────────────────────────────

// Strip editor-only conveniences before saving: empty media fields, and the
// implicit solution of order questions (authored order = correct order).
export const normalizeForSave = (draft) => ({
  subject: draft.subject.trim(),
  questions: draft.questions.map((q) => {
    const type = questionTypeOf(q)
    const out = {
      type,
      question: q.question.trim(),
      answers: q.answers.map((a) => a.trim()),
      cooldown: Number(q.cooldown),
      time: Number(q.time),
    }

    if (type !== QUESTION_TYPES.ORDER) {
      out.solution = q.solution
    }

    for (const media of ['image', 'video', 'audio']) {
      if (q[media]) {
        out[media] = q[media]
      }
    }

    return out
  }),
})

/** Which wizard step owns a validation issue (for badges and jump links). */
export const stepOfIssue = (issue) => {
  if (issue.field === 'subject') {
    return 'basics'
  }

  if (issue.field === 'cooldown' || issue.field === 'time') {
    return 'timing'
  }

  return 'questions'
}

/** All validation problems of the draft as saved, with wizard step attached. */
export const draftIssues = (draft) =>
  collectQuizzIssues(normalizeForSave(draft)).map((issue) => ({
    ...issue,
    step: stepOfIssue(issue),
  }))

const normText = (value) => value.trim().toLowerCase()

/**
 * Non-blocking oddities worth flagging on the review step.
 * @returns {Array<{ message: string, questionIndex?: number, step: string }>}
 */
export const draftWarnings = (draft) => {
  const warnings = []
  const { questions } = normalizeForSave(draft)

  if (questions.length === 1) {
    warnings.push({
      step: 'questions',
      message: 'Only one question — the game will be over in under a minute',
    })
  }

  const seenTexts = new Map()

  questions.forEach((question, questionIndex) => {
    const type = questionTypeOf(question)

    const texts = question.answers.map(normText).filter(Boolean)

    if (new Set(texts).size !== texts.length) {
      warnings.push({ questionIndex, step: 'questions', message: 'has duplicate answers' })
    }

    const text = normText(question.question)

    if (text) {
      if (seenTexts.has(text)) {
        warnings.push({
          questionIndex,
          step: 'questions',
          message: `is a duplicate of question ${seenTexts.get(text) + 1}`,
        })
      } else {
        seenTexts.set(text, questionIndex)
      }
    }

    if (
      type === QUESTION_TYPES.MULTI &&
      Array.isArray(question.solution) &&
      question.solution.length === question.answers.length
    ) {
      warnings.push({
        questionIndex,
        step: 'questions',
        message: 'every answer is marked correct — players just select everything',
      })
    }

    if (Number.isFinite(question.time) && question.time > 0 && question.time < 5) {
      warnings.push({
        questionIndex,
        step: 'timing',
        message: `only ${question.time}s to answer — that is very tight`,
      })
    }

    if (
      Number.isFinite(question.time) &&
      Number.isFinite(question.cooldown) &&
      question.cooldown > question.time
    ) {
      warnings.push({
        questionIndex,
        step: 'timing',
        message: 'reading time is longer than the answer time',
      })
    }
  })

  return warnings
}

// Reveal + leaderboard are host-paced; assume a brisk host for the estimate.
const HOST_PACE_SECONDS = 8

export const draftStats = (draft) => {
  const { questions } = normalizeForSave(draft)
  const typeCounts = {}
  let estimatedSeconds = ENGINE_TIMING.startTitleSeconds + ENGINE_TIMING.startCountdownSeconds

  for (const question of questions) {
    const type = questionTypeOf(question)
    typeCounts[type] = (typeCounts[type] ?? 0) + 1
    estimatedSeconds +=
      ENGINE_TIMING.preparedSeconds +
      (Number.isFinite(question.cooldown) ? question.cooldown : 0) +
      (Number.isFinite(question.time) ? question.time : 0) +
      HOST_PACE_SECONDS
  }

  return { questionCount: questions.length, typeCounts, estimatedSeconds }
}

export const formatDuration = (seconds) => {
  if (seconds < 90) {
    return `${Math.round(seconds)} s`
  }

  return `~${Math.round(seconds / 60)} min`
}

// ── local draft persistence (survives an accidental tab close) ──────────────

export const draftStorageKey = (quizzId) => `bazoot:quizDraft:${quizzId ?? 'new'}`

const storage = () => (typeof localStorage === 'undefined' ? null : localStorage)

export const loadStoredDraft = (key) => {
  try {
    const raw = storage()?.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null

    return parsed && typeof parsed.subject === 'string' && Array.isArray(parsed.questions)
      ? parsed
      : null
  } catch {
    return null
  }
}

export const storeDraft = (key, draft) => {
  try {
    storage()?.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage full or unavailable — autosave is best-effort.
  }
}

export const clearStoredDraft = (key) => {
  try {
    storage()?.removeItem(key)
  } catch {
    // ignore
  }
}
