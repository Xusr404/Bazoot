import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { defaultAvatarFor, isValidAvatar } from '@bazoot/shared/avatars'
import { allowReaction, isValidReaction } from '@bazoot/shared/reactions'
import { validateInviteCode, validateUsername } from '@bazoot/shared/validation'
import { GameError } from '../utils/errors.js'
import { safeHandler } from './safeHandler.js'
import { dispatchToEngine } from './dispatchToEngine.js'

// Handler pattern (Phase 6C): validate → call engine/room manager → emit.
export const registerPlayerHandlers = ({ io, socket, roomManager, bus, socketGuard = null, metrics = null }) => {
  // Per-socket flood guard for emoji reactions (this handler set is registered
  // once per connection, so the bucket is naturally scoped to one player).
  let reactionTimestamps = []
  const guard = (key, ruleName = 'event') => {
    socketGuard?.assertAllowed(socket, key, ruleName)
  }

  const requireRoom = (gameId) => {
    const room = roomManager.getRoom(gameId)

    if (!room) {
      throw new GameError('Game not found')
    }

    return room
  }

  socket.on(
    EVENTS.PLAYER_JOIN,
    safeHandler(socket, (inviteCode) => {
      guard(EVENTS.PLAYER_JOIN)
      const validation = validateInviteCode(inviteCode)

      if (!validation.ok) {
        throw new GameError(validation.message)
      }

      const room = roomManager.getRoomByInviteCode(inviteCode)

      if (!room) {
        throw new GameError('Game not found')
      }

      socket.emit(EVENTS.GAME_SUCCESS_ROOM, room.gameId)
    }),
  )

  socket.on(
    EVENTS.PLAYER_LOGIN,
    safeHandler(socket, ({ gameId, data }) => {
      guard(EVENTS.PLAYER_LOGIN)
      const room = requireRoom(gameId)
      const clientId = socket.handshake.auth.clientId

      if (roomManager.getPlayerByClientId(room, clientId)) {
        throw new GameError('Player already connected')
      }

      if (room.engine?.started) {
        throw new GameError('Game already started')
      }

      const validation = validateUsername(data?.username)

      if (!validation.ok) {
        throw new GameError(validation.message)
      }

      const player = {
        id: socket.id,
        clientId,
        connected: true,
        username: data.username,
        avatar: isValidAvatar(data?.avatar) ? data.avatar : defaultAvatarFor(clientId),
        points: 0,
      }

      roomManager.addPlayer(room, player)
      socket.join(room.gameId)

      bus.sendTo(room.manager.id, EVENTS.MANAGER_NEW_PLAYER, player)
      bus.broadcast(room.gameId, EVENTS.GAME_TOTAL_PLAYERS, room.players.length)
      socket.emit(EVENTS.GAME_SUCCESS_JOIN, room.gameId)
    }),
  )

  socket.on(
    EVENTS.PLAYER_SELECTED_ANSWER,
    safeHandler(socket, async ({ gameId, data }) => {
      guard(EVENTS.PLAYER_SELECTED_ANSWER, 'answer')
      const room = requireRoom(gameId)

      await dispatchToEngine(room, io, gameId, 'receiveAnswer', [socket.id, data?.answerKey])
    }),
  )

  socket.on(
    EVENTS.PLAYER_REACTION,
    safeHandler(socket, ({ gameId, emoji }) => {
      guard(EVENTS.PLAYER_REACTION)
      if (!isValidReaction(emoji)) {
        return
      }

      const room = roomManager.getRoomByPlayerSocketId(socket.id)
      const player = roomManager.getPlayerBySocketId(room, socket.id)

      if (!room || room.gameId !== gameId || !player) {
        return
      }

      const { allowed, timestamps } = allowReaction(reactionTimestamps, Date.now())
      reactionTimestamps = timestamps

      if (!allowed) {
        return
      }

      bus.broadcast(room.gameId, EVENTS.GAME_REACTION, { emoji, from: player.username })
    }),
  )

  socket.on(
    EVENTS.PLAYER_RECONNECT,
    safeHandler(socket, async ({ gameId }) => {
      guard(EVENTS.PLAYER_RECONNECT, 'reconnect')
      const clientId = socket.handshake.auth.clientId
      const room = roomManager.getPlayerRoom(gameId, clientId)

      if (!room) {
        socket.emit(EVENTS.GAME_RESET, 'Game not found')

        return
      }

      const player = roomManager.getPlayerByClientId(room, clientId)

      if (!player) {
        socket.emit(EVENTS.GAME_RESET, 'Game not found')

        return
      }

      if (player.connected) {
        socket.emit(EVENTS.GAME_RESET, 'Player already connected')

        return
      }

      socket.join(room.gameId)

      const reconnect = roomManager.reconnectPlayer(room, clientId, socket.id)

      if (!reconnect) {
        socket.emit(EVENTS.GAME_RESET, 'Game not found')

        return
      }

      const { oldSocketId } = reconnect
      metrics?.recordReconnect?.()

      let status = await dispatchToEngine(room, io, gameId, 'takePlayerStatus', [oldSocketId, socket.id], true)
      let currentQuestion = await dispatchToEngine(room, io, gameId, 'questionProgress', [], true)

      status = status ?? {
        name: STATUS.WAIT,
        data: { text: 'Waiting for players' },
      }
      
      currentQuestion = currentQuestion ?? { current: 1, total: null }

      socket.emit(EVENTS.PLAYER_SUCCESS_RECONNECT, {
        gameId: room.gameId,
        currentQuestion,
        status,
        player: {
          username: player.username,
          avatar: player.avatar,
          points: player.points,
        },
      })
      socket.emit(EVENTS.GAME_TOTAL_PLAYERS, room.players.length)
      console.log(`Player ${player.username} reconnected to game ${room.inviteCode}`)
    }),
  )
}
