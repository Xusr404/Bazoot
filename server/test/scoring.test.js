import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STREAK, awardWithStreak, streakMultiplier, timeToPoints } from '@bazoot/shared/scoring'

describe('timeToPoints', () => {
  it('awards ~scoreMax for an instant answer and 0 at the time limit', () => {
    const startTime = 1000
    assert.equal(timeToPoints({ startTime, timeLimitSeconds: 10, now: startTime }), 1000)
    assert.equal(timeToPoints({ startTime, timeLimitSeconds: 10, now: startTime + 10_000 }), 0)
    // Never negative past the limit.
    assert.equal(timeToPoints({ startTime, timeLimitSeconds: 10, now: startTime + 20_000 }), 0)
  })
})

describe('streakMultiplier', () => {
  it('gives no bonus for the first correct answer', () => {
    assert.equal(streakMultiplier(0), 1)
    assert.equal(streakMultiplier(1), 1)
  })

  it('grows by one step per consecutive correct answer', () => {
    assert.equal(streakMultiplier(2), 1 + STREAK.step)
    assert.equal(streakMultiplier(3), 1 + 2 * STREAK.step)
  })

  it('caps at maxSteps', () => {
    const cap = 1 + STREAK.maxSteps * STREAK.step
    assert.equal(streakMultiplier(1 + STREAK.maxSteps), cap)
    assert.equal(streakMultiplier(99), cap)
  })
})

describe('awardWithStreak', () => {
  it('returns base points and no bonus at streak 1', () => {
    const { points, base, bonus } = awardWithStreak({ basePoints: 800, streak: 1 })
    assert.equal(base, 800)
    assert.equal(points, 800)
    assert.equal(bonus, 0)
  })

  it('adds the streak bonus on top of the base, rounded', () => {
    const { points, base, bonus } = awardWithStreak({ basePoints: 800, streak: 3 })
    assert.equal(base, 800)
    assert.equal(points, Math.round(800 * streakMultiplier(3))) // 960
    assert.equal(bonus, points - base) // 160
  })

  it('minForBonus is the first streak length that yields a bonus', () => {
    assert.equal(awardWithStreak({ basePoints: 500, streak: STREAK.minForBonus - 1 }).bonus, 0)
    assert.ok(awardWithStreak({ basePoints: 500, streak: STREAK.minForBonus }).bonus > 0)
  })
})
