// Quick emoji reactions players fling during the game (engagement polish).
// Shared so the client renders exactly the set the server accepts, and the
// flood-guard constants stay in one place. No reaction literal lives elsewhere.

export const REACTIONS = ['😂', '❤️', '🔥', '👏', '😮', '😎', '🎉', '👍']

export const isValidReaction = (emoji) => typeof emoji === 'string' && REACTIONS.includes(emoji)

// Per-socket flood guard: at most REACTION_MAX_BURST reactions per rolling window.
export const REACTION_WINDOW_MS = 4000
export const REACTION_MAX_BURST = 6

/**
 * Pure sliding-window rate check. Returns the kept timestamps (caller stores
 * them) plus whether this reaction is allowed. Server-side guard against spam;
 * unit-tested without any socket.
 */
export const allowReaction = (timestamps, now, window = REACTION_WINDOW_MS, max = REACTION_MAX_BURST) => {
  const recent = timestamps.filter((t) => now - t < window)

  if (recent.length >= max) {
    return { allowed: false, timestamps: recent }
  }

  return { allowed: true, timestamps: [...recent, now] }
}
