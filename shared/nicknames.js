// Fun random player nicknames for the join screen (engagement polish). Every
// adjective+noun combination stays within the 4–20 char username limit
// (validation.js USERNAME_MIN/MAX), so a generated name always validates.

export const NICKNAME_ADJECTIVES = [
  'Swift', 'Brave', 'Clever', 'Mighty', 'Sneaky', 'Jolly', 'Cosmic', 'Turbo',
  'Funky', 'Lucky', 'Wild', 'Witty', 'Zappy', 'Spicy', 'Royal', 'Sunny',
]

export const NICKNAME_NOUNS = [
  'Fox', 'Otter', 'Tiger', 'Panda', 'Falcon', 'Yeti', 'Comet', 'Ninja',
  'Wizard', 'Dragon', 'Koala', 'Penguin', 'Llama', 'Phoenix', 'Raptor', 'Badger',
]

const pick = (list, rng) => list[Math.floor(rng() * list.length)]

/** e.g. "SwiftFox", "CosmicLlama" — always 7–13 chars (within the username limit). */
export const randomNickname = (rng = Math.random) =>
  `${pick(NICKNAME_ADJECTIVES, rng)}${pick(NICKNAME_NOUNS, rng)}`
