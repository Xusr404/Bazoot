import { EventEmitter } from 'node:events'

// Bus event names. `transport:*` events are emission instructions consumed by the
// socket layer (events/transport.js); `lifecycle:*` events are observability hooks
// for replay/analytics/moderation subscribers (Phase 9C).
export const BUS = {
  BROADCAST: 'transport:broadcast', // { gameId, event, payload, exceptId? }
  SEND_TO: 'transport:sendTo', // { targetId, event, payload }
  KICK: 'transport:kick', // { gameId, playerId }
  CLOSE_ROOM: 'transport:closeRoom', // { gameId }

  ROOM_CREATED: 'lifecycle:roomCreated', // { gameId, inviteCode }
  ROOM_DESTROYED: 'lifecycle:roomDestroyed', // { gameId }
  GAME_STARTED: 'lifecycle:gameStarted', // { gameId, subject, players }
  ROUND_STARTED: 'lifecycle:roundStarted', // { gameId, questionIndex }
  ANSWER_RECEIVED: 'lifecycle:answerReceived', // { gameId, playerId, answerKey }
  ROUND_REVEALED: 'lifecycle:roundRevealed', // { gameId, questionIndex }
  GAME_ENDED: 'lifecycle:gameEnded', // { gameId, top }
  GAME_RESTARTED: 'lifecycle:gameRestarted', // { gameId, players }
}

// Every server-side game event flows through this bus. The game layer never
// imports socket.io — it publishes here and the transport binding forwards.
export class GameEventBus extends EventEmitter {
  /** Emit a socket event to every client in a room (optionally excluding one socket). */
  broadcast(gameId, event, payload, exceptId) {
    this.emit(BUS.BROADCAST, { gameId, event, payload, exceptId })
  }

  /** Emit a socket event to a single socket id. */
  sendTo(targetId, event, payload) {
    this.emit(BUS.SEND_TO, { targetId, event, payload })
  }

  /** Make a socket leave a room (kick). */
  kick(gameId, playerId) {
    this.emit(BUS.KICK, { gameId, playerId })
  }

  /** Make every socket leave a destroyed game room. */
  closeRoom(gameId) {
    this.emit(BUS.CLOSE_ROOM, { gameId })
  }

  /** Publish a lifecycle event for observers. */
  publish(event, payload) {
    this.emit(event, payload)
  }
}
