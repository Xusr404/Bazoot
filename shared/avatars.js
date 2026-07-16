// Emoji avatars players pick on the join screen (engagement polish). Pure data
// + helpers, shared by the client (picker + render) and the server (validation
// + deterministic default). No avatar string literal lives anywhere else.

export const AVATARS = [
  '🦊', '🐼', '🐸', '🐵', '🐶', '🐱', '🦁', '🐯',
  '🐨', '🐰', '🐻', '🐷', '🐮', '🐔', '🐧', '🦄',
  '🐲', '🦉', '🦖', '🐙', '🦋', '🐝', '🦀', '🐳',
]

/** Stable string → non-negative int, so a given seed always maps to one avatar. */
const hashSeed = (seed) => {
  const text = String(seed ?? '')
  let hash = 0

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }

  return Math.abs(hash)
}

/** Deterministic fallback for a player who never picked one (or an old client). */
export const defaultAvatarFor = (seed) => AVATARS[hashSeed(seed) % AVATARS.length]

export const isValidAvatar = (avatar) => typeof avatar === 'string' && AVATARS.includes(avatar)

/**
 * The avatar to render for a player object: their explicit choice when valid,
 * otherwise a stable default derived from clientId / id / username. Keeps every
 * render site (lobby chip, bottom bar, leaderboard, podium) backward compatible
 * with players that joined before avatars existed.
 */
export const resolveAvatar = (player) => {
  if (player && isValidAvatar(player.avatar)) {
    return player.avatar
  }

  return defaultAvatarFor(player?.clientId ?? player?.id ?? player?.username)
}
