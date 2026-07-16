// Time-bonus scoring, identical to the source formula (timeToPoint):
// linear decay from scoreMax to 0 across the question's time limit.
// Computed when the answer arrives; rounded (and awarded) only if correct.
export const timeToPoints = ({ startTime, timeLimitSeconds, scoreMax = 1000, now = Date.now() }) => {
  const elapsedSeconds = (now - startTime) / 1000
  const points = scoreMax - (scoreMax / timeLimitSeconds) * elapsedSeconds

  return Math.max(0, points)
}

// Answer-streak bonus (the signature Kahoot mechanic): consecutive correct
// answers multiply the time-bonus points, rewarding consistency on top of speed.
// `streak` is the number of consecutive correct answers *including* the current
// one: 1 → ×1.0 (no bonus yet), 2 → ×1.1, 3 → ×1.2, … capped at 6+ → ×1.5.
export const STREAK = {
  step: 0.1, // multiplier added per consecutive correct beyond the first
  maxSteps: 5, // cap: a streak of 6+ all share the maximum multiplier
  minForBonus: 2, // streak length at which a bonus first applies / is shown
}

export const streakMultiplier = (streak) => {
  const steps = Math.min(Math.max((streak ?? 0) - 1, 0), STREAK.maxSteps)

  return 1 + steps * STREAK.step
}

// Final awarded points for a correct answer at a given streak, plus the part of
// that total attributable to the streak (the "bonus"). Pass `basePoints`
// unrounded (the raw timeToPoints value) for an accurate split.
export const awardWithStreak = ({ basePoints, streak }) => {
  const base = Math.round(basePoints)
  const points = Math.round(basePoints * streakMultiplier(streak))

  return { points, base, bonus: points - base, streak }
}
