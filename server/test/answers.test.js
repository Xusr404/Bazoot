import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkAnswer,
  correctForReveal,
  createDisplayOrder,
  isValidAnswerPayload,
  solutionOrderOf,
  tallyResponses,
} from '@bazoot/shared/answers'

const single = { type: 'single', answers: ['A', 'B', 'C', 'D'], solution: 1 }
const trueFalse = { type: 'trueFalse', answers: ['True', 'False'], solution: 0 }
const multi = { type: 'multi', answers: ['A', 'B', 'C', 'D'], solution: [0, 2] }
const order = { type: 'order', answers: ['first', 'second', 'third'] }
const legacy = { answers: ['A', 'B'], solution: 0 } // no type → single

describe('isValidAnswerPayload', () => {
  it('accepts in-range indices for single/trueFalse/legacy', () => {
    assert.equal(isValidAnswerPayload(single, 0), true)
    assert.equal(isValidAnswerPayload(single, 3), true)
    assert.equal(isValidAnswerPayload(trueFalse, 1), true)
    assert.equal(isValidAnswerPayload(legacy, 1), true)
  })

  it('rejects out-of-range, non-integer, and array payloads for single', () => {
    assert.equal(isValidAnswerPayload(single, 4), false)
    assert.equal(isValidAnswerPayload(single, -1), false)
    assert.equal(isValidAnswerPayload(single, 1.5), false)
    assert.equal(isValidAnswerPayload(single, [1]), false)
    assert.equal(isValidAnswerPayload(single, '1'), false)
  })

  it('multi requires a non-empty unique array of valid indices', () => {
    assert.equal(isValidAnswerPayload(multi, [0, 2]), true)
    assert.equal(isValidAnswerPayload(multi, [3]), true)
    assert.equal(isValidAnswerPayload(multi, []), false)
    assert.equal(isValidAnswerPayload(multi, [0, 0]), false)
    assert.equal(isValidAnswerPayload(multi, [0, 4]), false)
    assert.equal(isValidAnswerPayload(multi, 1), false)
  })

  it('order requires a full permutation', () => {
    assert.equal(isValidAnswerPayload(order, [2, 0, 1]), true)
    assert.equal(isValidAnswerPayload(order, [0, 1]), false)
    assert.equal(isValidAnswerPayload(order, [0, 1, 1]), false)
    assert.equal(isValidAnswerPayload(order, [0, 1, 3]), false)
  })
})

describe('checkAnswer', () => {
  it('single: exact index match', () => {
    assert.equal(checkAnswer({ question: single, answerId: 1 }), true)
    assert.equal(checkAnswer({ question: single, answerId: 0 }), false)
    assert.equal(checkAnswer({ question: legacy, answerId: 0 }), true)
  })

  it('multi: exact set match, any order', () => {
    assert.equal(checkAnswer({ question: multi, answerId: [0, 2] }), true)
    assert.equal(checkAnswer({ question: multi, answerId: [2, 0] }), true)
    assert.equal(checkAnswer({ question: multi, answerId: [0] }), false)
    assert.equal(checkAnswer({ question: multi, answerId: [0, 1, 2] }), false)
    assert.equal(checkAnswer({ question: multi, answerId: 0 }), false)
  })

  it('order: displayed sequence must map back to the authored order', () => {
    // displayOrder[displayed] = original; authored order is the solution.
    const displayOrder = [2, 0, 1] // displayed 0 = original 2, displayed 1 = original 0, …
    // Correct submission: original 0 → displayed 1, original 1 → displayed 2, original 2 → displayed 0
    assert.equal(checkAnswer({ question: order, answerId: [1, 2, 0], displayOrder }), true)
    assert.equal(checkAnswer({ question: order, answerId: [0, 1, 2], displayOrder }), false)
  })

  it('order: explicit solution permutation overrides authored order', () => {
    const reversed = { ...order, solution: [2, 1, 0] }
    const displayOrder = [0, 1, 2] // unshuffled for clarity
    assert.equal(checkAnswer({ question: reversed, answerId: [2, 1, 0], displayOrder }), true)
    assert.equal(checkAnswer({ question: reversed, answerId: [0, 1, 2], displayOrder }), false)
  })
})

describe('tallyResponses', () => {
  it('single: counts votes per answer', () => {
    const totals = tallyResponses({
      question: single,
      playersAnswers: [{ answerId: 1 }, { answerId: 1 }, { answerId: 3 }],
    })
    assert.deepEqual(totals, { 1: 2, 3: 1 })
  })

  it('multi: counts each selection', () => {
    const totals = tallyResponses({
      question: multi,
      playersAnswers: [{ answerId: [0, 2] }, { answerId: [0] }],
    })
    assert.deepEqual(totals, { 0: 2, 2: 1 })
  })

  it('order: counts correctly-placed answers per displayed index', () => {
    const displayOrder = [2, 0, 1]
    const totals = tallyResponses({
      question: order,
      playersAnswers: [
        { answerId: [1, 2, 0] }, // fully correct
        { answerId: [1, 0, 2] }, // only position 0 correct
      ],
      displayOrder,
    })
    assert.deepEqual(totals, { 1: 2, 2: 1, 0: 1 })
  })
})

describe('correctForReveal / display order', () => {
  it('passes through single and multi solutions', () => {
    assert.equal(correctForReveal({ question: single }), 1)
    assert.deepEqual(correctForReveal({ question: multi }), [0, 2])
  })

  it('order: returns the correct sequence of displayed indices', () => {
    const displayOrder = [2, 0, 1]
    assert.deepEqual(correctForReveal({ question: order, displayOrder }), [1, 2, 0])
  })

  it('solutionOrderOf defaults to the authored order', () => {
    assert.deepEqual(solutionOrderOf(order), [0, 1, 2])
    assert.deepEqual(solutionOrderOf({ ...order, solution: [1, 0, 2] }), [1, 0, 2])
  })

  it('createDisplayOrder returns a permutation', () => {
    for (let i = 0; i < 20; i += 1) {
      const displayOrder = createDisplayOrder(4)
      assert.deepEqual([...displayOrder].sort(), [0, 1, 2, 3])
    }
  })
})
