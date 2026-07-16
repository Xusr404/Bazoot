import { EVENTS } from '@bazoot/shared/events'
import { GameError } from '../utils/errors.js'

// Phase 9E: every socket handler runs inside try/catch. Game-rule violations go
// back to the offending client; unexpected errors are logged. The process never
// crashes on a game error.
export const safeHandler = (
  socket,
  handler,
  { errorEvent = EVENTS.GAME_ERROR_MESSAGE } = {},
) => async (...args) => {
  try {
    await handler(...args)
  } catch (error) {
    if (error instanceof GameError) {
      socket.emit(errorEvent, error.message)

      return
    }

    console.error('Unhandled handler error:', error)
    socket.emit(errorEvent, 'Internal game error')
  }
}
