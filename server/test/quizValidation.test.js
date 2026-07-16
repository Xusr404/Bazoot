import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { collectQuizzIssues, validateQuizz } from '@bazoot/shared/quizValidation'

const validSingle = {
  question: 'Pick B',
  answers: ['A', 'B'],
  solution: 1,
  cooldown: 5,
  time: 15,
}

const quizz = (overrides = {}) => ({
  subject: 'Test quiz',
  questions: [validSingle],
  ...overrides,
})

const question = (overrides = {}) => quizz({ questions: [{ ...validSingle, ...overrides }] })

describe('validateQuizz', () => {
  it('accepts a valid single-choice quiz', () => {
    assert.deepEqual(validateQuizz(quizz()), { ok: true })
  })

  it('accepts every question type', () => {
    const all = quizz({
      questions: [
        validSingle,
        { type: 'trueFalse', question: 'T?', answers: ['True', 'False'], solution: 0, cooldown: 3, time: 10 },
        { type: 'multi', question: 'M?', answers: ['A', 'B', 'C'], solution: [0, 2], cooldown: 3, time: 10 },
        { type: 'order', question: 'O?', answers: ['1st', '2nd', '3rd'], cooldown: 3, time: 10 },
        { type: 'order', question: 'O2?', answers: ['a', 'b'], solution: [1, 0], cooldown: 3, time: 10 },
      ],
    })
    assert.deepEqual(validateQuizz(all), { ok: true })
  })

  it('rejects missing subject and empty questions', () => {
    assert.equal(validateQuizz(quizz({ subject: '' })).ok, false)
    assert.equal(validateQuizz(quizz({ subject: '   ' })).ok, false)
    assert.equal(validateQuizz(quizz({ questions: [] })).ok, false)
    assert.equal(validateQuizz(null).ok, false)
  })

  it('rejects bad answers arrays', () => {
    assert.equal(validateQuizz(question({ answers: ['only one'] })).ok, false)
    // 7 answers exceeds the max of 6.
    assert.equal(
      validateQuizz(question({ answers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], solution: 0 })).ok,
      false,
    )
    assert.equal(validateQuizz(question({ answers: ['a', ''] })).ok, false)
  })

  it('accepts up to six answers', () => {
    assert.equal(
      validateQuizz(question({ answers: ['a', 'b', 'c', 'd', 'e', 'f'], solution: 5 })).ok,
      true,
    )
  })

  it('rejects out-of-range solutions', () => {
    assert.equal(validateQuizz(question({ solution: 2 })).ok, false)
    assert.equal(validateQuizz(question({ solution: -1 })).ok, false)
    assert.equal(validateQuizz(question({ solution: undefined })).ok, false)
  })

  it('rejects invalid timing', () => {
    assert.equal(validateQuizz(question({ cooldown: 0 })).ok, false)
    assert.equal(validateQuizz(question({ time: 1 })).ok, false)
    assert.equal(validateQuizz(question({ time: 9999 })).ok, false)
  })

  it('type-specific rules', () => {
    assert.equal(
      validateQuizz(question({ type: 'trueFalse', answers: ['T', 'F', 'maybe'], solution: 0 })).ok,
      false,
    )
    assert.equal(validateQuizz(question({ type: 'multi', solution: [] })).ok, false)
    assert.equal(validateQuizz(question({ type: 'multi', solution: [0, 0] })).ok, false)
    assert.equal(validateQuizz(question({ type: 'order', solution: [0, 0] })).ok, false)
    assert.equal(validateQuizz(question({ type: 'banana' })).ok, false)
  })

  it('rejects non-http media URLs', () => {
    assert.equal(validateQuizz(question({ image: 'javascript:alert(1)' })).ok, false)
    assert.equal(validateQuizz(question({ image: 'https://example.com/x.png' })).ok, true)
    assert.equal(validateQuizz(question({ image: '' })).ok, true)
  })
})

describe('collectQuizzIssues', () => {
  it('returns an empty list for a valid quiz', () => {
    assert.deepEqual(collectQuizzIssues(quizz()), [])
  })

  it('collects every problem with a structured path', () => {
    const issues = collectQuizzIssues({
      subject: '',
      questions: [
        { ...validSingle, question: '', cooldown: 0 },
        { ...validSingle, answers: ['A', ''] },
      ],
    })

    assert.deepEqual(issues, [
      { field: 'subject', message: 'Subject is required' },
      { field: 'text', message: 'text is required', questionIndex: 0 },
      { field: 'cooldown', message: 'cooldown must be 1–60 seconds', questionIndex: 0 },
      { field: 'answer', message: 'every answer needs text', answerIndex: 1, questionIndex: 1 },
    ])
  })

  it('keeps validateQuizz reporting the first issue with its question label', () => {
    const result = validateQuizz(quizz({ questions: [{ ...validSingle, question: '' }] }))

    assert.deepEqual(result, { ok: false, message: 'Question 1: text is required' })
  })
})
