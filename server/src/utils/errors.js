// Recoverable game-rule violation. Socket handlers catch these and forward the
// message to the offending client as EVENTS.GAME_ERROR_MESSAGE (Phase 9E).
// `code` lets handlers branch on specific business cases (e.g. EMAIL_UNVERIFIED)
// without string-matching messages.
export class GameError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'GameError'
    this.code = code
  }
}
