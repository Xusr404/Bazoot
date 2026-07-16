import { RoomStore } from './RoomStore.js'

// Default in-process store: a plain Map keyed by gameId.
export class MemoryRoomStore extends RoomStore {
  constructor() {
    super()
    this.rooms = new Map()
  }

  get(gameId) {
    return this.rooms.get(gameId)
  }

  set(gameId, room) {
    this.rooms.set(gameId, room)
  }

  delete(gameId) {
    this.rooms.delete(gameId)
  }

  values() {
    return this.rooms.values()
  }

  async health() {
    return { status: 'ok', type: 'memory' }
  }
}
