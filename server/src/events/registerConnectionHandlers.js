import { EVENTS } from '@bazoot/shared/events'
import { dispatchToEngine } from './dispatchToEngine.js'

// Disconnect lifecycle, mirroring the source app:
// - manager gone before start → game dies immediately
// - manager gone after start → room marked empty, reaped after the timeout
// - player gone before start → removed from the room
// - player gone after start → flagged disconnected (can reconnect)
export const registerConnectionHandlers = ({ io, socket, roomManager, bus }) => {
  socket.on('disconnect', async () => {
    const managedRoom = roomManager.getRoomByManagerSocketId(socket.id)

    if (managedRoom) {
      roomManager.markManagerDisconnected(managedRoom)

      if (!managedRoom.engine?.started) {
        console.log(`Reset game ${managedRoom.inviteCode} (manager disconnected)`)
        managedRoom.engine?.abortCountdown()
        bus.broadcast(managedRoom.gameId, EVENTS.GAME_RESET, 'Manager disconnected')
        roomManager.destroyRoom(managedRoom.gameId)

        return
      }
    }

    const room = roomManager.getRoomByPlayerSocketId(socket.id)

    if (!room) {
      return
    }

    const player =
      roomManager.getPlayerBySocketId?.(room, socket.id) ??
      room.players.find((candidate) => candidate.id === socket.id)

    if (!player) {
      return
    }

    if (!room.engine?.started) {
      roomManager.removePlayer(room, socket.id)
      bus.sendTo(room.manager.id, EVENTS.MANAGER_REMOVE_PLAYER, player.id)
      bus.broadcast(room.gameId, EVENTS.GAME_TOTAL_PLAYERS, room.players.length)
      console.log(`Removed player ${player.username} from game ${room.inviteCode}`)

      return
    }

    const disconnectedPlayer = roomManager.markPlayerDisconnected(room, socket.id)

    if (!disconnectedPlayer) {
      return
    }

    bus.broadcast(room.gameId, EVENTS.GAME_TOTAL_PLAYERS, room.players.length)
    await dispatchToEngine(room, io, room.gameId, 'checkAllAnswered', [socket.id])
  })
}
