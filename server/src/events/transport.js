import { BUS } from '../game/GameEventBus.js'

// The only place where bus traffic meets socket.io. The game layer publishes
// transport events; this binding forwards them to the right sockets.
export const bindTransport = (io, bus) => {
  bus.on(BUS.BROADCAST, ({ gameId, event, payload, exceptId }) => {
    const target = exceptId ? io.to(gameId).except(exceptId) : io.to(gameId)

    if (payload === undefined) {
      target.emit(event)
    } else {
      target.emit(event, payload)
    }
  })

  bus.on(BUS.SEND_TO, ({ targetId, event, payload }) => {
    io.to(targetId).emit(event, payload)
  })

  bus.on(BUS.KICK, ({ gameId, playerId }) => {
    io.in(playerId).socketsLeave(gameId)
  })

  bus.on(BUS.CLOSE_ROOM, ({ gameId }) => {
    io.in(gameId).socketsLeave(gameId)
  })
}
