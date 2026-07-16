import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addAnswer,
  addQuestion,
  applyTimingToAll,
  changeQuestionType,
  createDraft,
  draftIssues,
  draftStats,
  draftWarnings,
  duplicateQuestion,
  emptyQuestion,
  moveQuestion,
  normalizeForSave,
  removeAnswer,
  removeQuestion,
  reorderQuestionsByIds,
  setAnswerText,
  setSubject,
  stepOfIssue,
  toggleMultiSolution,
} from '../src/screens/quizWizard/quizDraft.js'

const validDraft = () => {
  let draft = createDraft({
    subject: 'Capitals',
    questions: [
      { question: 'Capital of France?', answers: ['Paris', 'Rome'], solution: 0, cooldown: 5, time: 15 },
    ],
  })

  return draft
}

describe('quiz draft mutations', () => {
  it('creates a one-question draft with editor defaults', () => {
    const draft = createDraft(null)

    assert.equal(draft.subject, '')
    assert.equal(draft.questions.length, 1)

    // Draft questions carry a transient _id (drag identity / React key); the
    // rest matches the empty template and the _id never reaches the saved shape.
    const { _id, ...question } = draft.questions[0]
    assert.equal(typeof _id, 'string')
    assert.deepEqual(question, emptyQuestion())
  })

  it('mutations are immutable', () => {
    const draft = validDraft()
    const next = setSubject(draft, 'New subject')

    assert.equal(draft.subject, 'Capitals')
    assert.equal(next.subject, 'New subject')
    assert.notEqual(draft, next)
  })

  it('switching to true/false locks the answers', () => {
    const draft = changeQuestionType(validDraft(), 0, 'trueFalse')

    assert.deepEqual(draft.questions[0].answers, ['True', 'False'])
    assert.equal(draft.questions[0].solution, 0)
  })

  it('removing an answer keeps solution markers aligned', () => {
    let draft = validDraft()
    draft = addAnswer(draft, 0)
    draft = setAnswerText(draft, 0, 2, 'Berlin')
    draft = changeQuestionType(draft, 0, 'multi')
    draft = toggleMultiSolution(draft, 0, 0)
    draft = toggleMultiSolution(draft, 0, 2)
    assert.deepEqual(draft.questions[0].solution, [0, 2])

    draft = removeAnswer(draft, 0, 1)
    assert.deepEqual(draft.questions[0].answers, ['Paris', 'Berlin'])
    assert.deepEqual(draft.questions[0].solution, [0, 1])
  })

  it('add/duplicate/move/remove questions', () => {
    let draft = validDraft()
    draft = addQuestion(draft)
    assert.equal(draft.questions.length, 2)

    draft = duplicateQuestion(draft, 0)
    assert.equal(draft.questions.length, 3)
    assert.equal(draft.questions[1].question, 'Capital of France?')

    draft = moveQuestion(draft, 0, 1)
    assert.equal(draft.questions[1].question, 'Capital of France?')

    draft = removeQuestion(draft, 2)
    assert.equal(draft.questions.length, 2)

    // The last question cannot be removed.
    draft = removeQuestion(removeQuestion(draft, 0), 0)
    assert.equal(draft.questions.length, 1)
  })
})

describe('reorder + bulk timing helpers', () => {
  const threeQuestions = () =>
    createDraft({
      subject: 'S',
      questions: [
        { question: 'Q1', answers: ['a', 'b'], solution: 0, cooldown: 5, time: 15 },
        { question: 'Q2', answers: ['a', 'b'], solution: 0, cooldown: 7, time: 20 },
        { question: 'Q3', answers: ['a', 'b'], solution: 0, cooldown: 9, time: 25 },
      ],
    })

  it('gives a duplicated question its own id', () => {
    const draft = duplicateQuestion(threeQuestions(), 0)

    assert.equal(draft.questions[0].question, draft.questions[1].question)
    assert.notEqual(draft.questions[0]._id, draft.questions[1]._id)
  })

  it('reorders questions to match an id list', () => {
    const draft = threeQuestions()
    const [a, b, c] = draft.questions.map((q) => q._id)

    const reordered = reorderQuestionsByIds(draft, [c, a, b])

    assert.deepEqual(
      reordered.questions.map((q) => q.question),
      ['Q3', 'Q1', 'Q2'],
    )

    // A stale/partial id list is ignored rather than dropping questions.
    assert.equal(reorderQuestionsByIds(draft, [a, b]), draft)
  })

  it('copies one question’s timing onto every question, preserving ids', () => {
    const draft = threeQuestions()
    const next = applyTimingToAll(draft, 8, 30)

    assert.deepEqual(
      next.questions.map((q) => q.cooldown),
      [8, 8, 8],
    )
    assert.deepEqual(
      next.questions.map((q) => q.time),
      [30, 30, 30],
    )
    assert.deepEqual(
      next.questions.map((q) => q._id),
      draft.questions.map((q) => q._id),
    )
  })
})

describe('normalizeForSave', () => {
  it('trims text, drops empty media, and strips order solutions', () => {
    let draft = createDraft({
      subject: '  Capitals  ',
      questions: [
        {
          type: 'order',
          question: ' Sort! ',
          answers: [' a ', 'b'],
          cooldown: 5,
          time: 15,
          image: '',
          video: 'https://example.com/v.mp4',
        },
      ],
    })

    const saved = normalizeForSave(draft)

    assert.equal(saved.subject, 'Capitals')
    assert.equal(saved.questions[0].question, 'Sort!')
    assert.deepEqual(saved.questions[0].answers, ['a', 'b'])
    assert.equal('solution' in saved.questions[0], false)
    assert.equal('image' in saved.questions[0], false)
    assert.equal(saved.questions[0].video, 'https://example.com/v.mp4')
  })
})

describe('draft validation mapping', () => {
  it('a fresh draft reports subject and question problems with steps', () => {
    const issues = draftIssues(createDraft(null))

    assert.ok(issues.some((issue) => issue.field === 'subject' && issue.step === 'basics'))
    assert.ok(issues.some((issue) => issue.field === 'text' && issue.step === 'questions'))
  })

  it('timing issues map to the timing step', () => {
    const draft = createDraft({
      subject: 'S',
      questions: [{ question: 'Q', answers: ['a', 'b'], solution: 0, cooldown: 0, time: 15 }],
    })

    const issue = draftIssues(draft).find((i) => i.field === 'cooldown')
    assert.equal(issue.step, 'timing')
    assert.equal(stepOfIssue(issue), 'timing')
  })

  it('a valid draft has no issues', () => {
    assert.deepEqual(draftIssues(validDraft()), [])
  })
})

describe('draft warnings', () => {
  it('flags duplicates, tight timing, and single-question quizzes', () => {
    const draft = createDraft({
      subject: 'S',
      questions: [
        { question: 'Q1', answers: ['same', 'same'], solution: 0, cooldown: 10, time: 4 },
      ],
    })

    const warnings = draftWarnings(draft)
    const messages = warnings.map((w) => w.message)

    assert.ok(messages.some((m) => m.includes('Only one question')))
    assert.ok(messages.some((m) => m.includes('duplicate answers')))
    assert.ok(messages.some((m) => m.includes('very tight')))
    assert.ok(messages.some((m) => m.includes('reading time is longer')))
  })

  it('is silent for a sensible quiz', () => {
    const draft = createDraft({
      subject: 'S',
      questions: [
        { question: 'Q1', answers: ['a', 'b'], solution: 0, cooldown: 5, time: 15 },
        { question: 'Q2', answers: ['c', 'd'], solution: 1, cooldown: 5, time: 15 },
      ],
    })

    assert.deepEqual(draftWarnings(draft), [])
  })
})

describe('draftStats', () => {
  it('counts questions per type and estimates the duration', () => {
    const draft = createDraft({
      subject: 'S',
      questions: [
        { question: 'Q1', answers: ['a', 'b'], solution: 0, cooldown: 5, time: 15 },
        { type: 'order', question: 'Q2', answers: ['a', 'b'], cooldown: 5, time: 15 },
      ],
    })

    const stats = draftStats(draft)

    assert.equal(stats.questionCount, 2)
    assert.deepEqual(stats.typeCounts, { single: 1, order: 1 })
    assert.ok(stats.estimatedSeconds > 40)
  })
})
