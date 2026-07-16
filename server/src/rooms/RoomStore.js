// Storage interface for rooms (Phase 9B). Default implementation is
// MemoryRoomStore; a Redis-backed store can slot in with zero GameEngine changes.
/* eslint-disable no-unused-vars */
export class RoomStore {
  /** @returns {object | undefined} room keyed by gameId */
  get(gameId) {
    throw new Error('Not implemented')
  }

  set(gameId, room) {
    throw new Error('Not implemented')
  }

  delete(gameId) {
    throw new Error('Not implemented')
  }

  /** @returns {Iterable<object>} all rooms */
  values() {
    throw new Error('Not implemented')
  }
}
