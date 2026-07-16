import { useCallback, useRef, useState } from 'react'

// Bounded undo/redo history over an immutable value, modelled as a
// { past, present, future } triple. The transitions are pure and exported so
// node --test can exercise the coalescing / undo / redo invariants directly;
// the hook only adds React state and the time-based coalescing decision.
const COALESCE_MS = 450
const HISTORY_LIMIT = 100

export const initHistory = (present) => ({ past: [], present, future: [] })

// Commit a new value. When `coalesce` is set the change continues the current
// history entry (a typing burst, one drag gesture) instead of adding a step;
// any change still drops the redo branch. No-ops return the same object.
export const pushHistory = (history, value, coalesce) => {
  if (value === history.present) {
    return history
  }

  if (coalesce && history.past.length > 0) {
    return { past: history.past, present: value, future: [] }
  }

  const past = [...history.past, history.present]

  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: value,
    future: [],
  }
}

export const undoHistory = (history) => {
  if (history.past.length === 0) {
    return history
  }

  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  }
}

export const redoHistory = (history) => {
  if (history.future.length === 0) {
    return history
  }

  const [present, ...future] = history.future

  return { past: [...history.past, history.present], present, future }
}

export const useHistoryState = (initialValue) => {
  const [history, setHistory] = useState(() => initHistory(initialValue))

  // Identity + timestamp of the last commit, used to decide coalescing.
  const lastTag = useRef(null)
  const lastAt = useRef(0)

  const set = useCallback((next, { tag = null } = {}) => {
    const now = Date.now()
    const coalesce = tag !== null && tag === lastTag.current && now - lastAt.current < COALESCE_MS
    lastTag.current = tag
    lastAt.current = now

    setHistory((current) =>
      pushHistory(current, typeof next === 'function' ? next(current.present) : next, coalesce),
    )
  }, [])

  const undo = useCallback(() => {
    lastTag.current = null
    setHistory(undoHistory)
  }, [])

  const redo = useCallback(() => {
    lastTag.current = null
    setHistory(redoHistory)
  }, [])

  // Re-seat history around a new baseline (loading a quiz, restoring a draft).
  const reset = useCallback((value) => {
    lastTag.current = null
    lastAt.current = 0
    setHistory(initHistory(value))
  }, [])

  return {
    state: history.present,
    set,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
