import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  initHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../src/hooks/useHistoryState.js'

describe('history transitions', () => {
  it('pushes discrete entries and walks undo/redo', () => {
    let history = initHistory('a')
    history = pushHistory(history, 'b', false)
    history = pushHistory(history, 'c', false)

    assert.equal(history.present, 'c')
    assert.deepEqual(history.past, ['a', 'b'])

    history = undoHistory(history)
    assert.equal(history.present, 'b')

    history = undoHistory(history)
    assert.equal(history.present, 'a')
    assert.equal(history.past.length, 0)

    history = redoHistory(history)
    assert.equal(history.present, 'b')
  })

  it('coalesces consecutive changes into a single undo step', () => {
    let history = initHistory('')
    history = pushHistory(history, 'a', false) // first keystroke — new entry
    history = pushHistory(history, 'ab', true) // continued typing — coalesces
    history = pushHistory(history, 'abc', true)

    assert.equal(history.present, 'abc')
    assert.deepEqual(history.past, [''])

    history = undoHistory(history)
    assert.equal(history.present, '')
  })

  it('records the first change even when asked to coalesce', () => {
    const history = pushHistory(initHistory('a'), 'b', true)
    assert.deepEqual(history.past, ['a'])
  })

  it('drops the redo branch when a new change lands after an undo', () => {
    let history = pushHistory(initHistory('a'), 'b', false)
    history = undoHistory(history)
    assert.deepEqual(history.future, ['b'])

    history = pushHistory(history, 'c', false)
    assert.deepEqual(history.future, [])
    assert.equal(redoHistory(history).present, 'c') // redo is now a no-op
  })

  it('treats a no-op change as identity', () => {
    const history = initHistory('a')
    assert.equal(pushHistory(history, 'a', false), history)
  })
})
