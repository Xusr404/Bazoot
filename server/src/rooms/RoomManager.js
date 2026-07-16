import { v4 as uuid } from 'uuid'
import { BUS } from '../game/GameEventBus.js'
import { createInviteCode } from '../game/inviteCode.js'
import { GameError } from '../utils/errors.js'

// Room lifecycle: create / lookup / join / kick / destroy + empty-room reaping.
// A "room" is plain state; the per-room GameEngine drives the game flow.
export class RoomManager {
  constructor({
    store,
    bus,
    maxPlayersPerRoom = 50,
    maxActiveRooms = 200,
    emptyGameTimeoutMs = 5 * 60 * 1000,
    sweepIntervalMs = 60_000,
  }) {
    this.store = store
    this.bus = bus
    this.maxPlayersPerRoom = maxPlayersPerRoom
    this.maxActiveRooms = maxActiveRooms
    this.emptyGameTimeoutMs = emptyGameTimeoutMs
    this.emptySince = new Map() // gameId → epoch ms
    this.roomsByInviteCode = new Map()
    this.roomsByManagerSocketId = new Map()
    this.roomsByPlayerSocketId = new Map()
    this.roomsByPlayerClientKey = new Map()
    this.playersBySocketId = new Map()
    this.playerSocketRoomIds = new Map()
    this.playersByClientKey = new Map()
    this.roomIndexKeys = new Map()
    this.roomActionQueues = new Map()
    this.rebuildIndexes()
    this.sweepInterval = setInterval(() => this.sweepEmptyRooms(), sweepIntervalMs)
    this.sweepInterval.unref?.()
  }

  rebuildIndexes() {
    this.roomsByInviteCode.clear()
    this.roomsByManagerSocketId.clear()
    this.roomsByPlayerSocketId.clear()
    this.roomsByPlayerClientKey.clear()
    this.playersBySocketId.clear()
    this.playerSocketRoomIds.clear()
    this.playersByClientKey.clear()
    this.roomIndexKeys.clear()

    for (const room of this.store.values()) {
      this.indexRoom(room)
    }
  }

  removeRoomIndexes(gameId) {
    const keys = this.roomIndexKeys.get(gameId)

    if (keys) {
      this.roomsByInviteCode.delete(keys.inviteCode)

      if (keys.managerSocketId) {
        this.roomsByManagerSocketId.delete(keys.managerSocketId)
      }

      for (const socketId of keys.playerSocketIds) {
        this.roomsByPlayerSocketId.delete(socketId)
        this.playersBySocketId.delete(socketId)
        this.playerSocketRoomIds.delete(socketId)
      }

      for (const clientKey of keys.playerClientKeys) {
        this.roomsByPlayerClientKey.delete(clientKey)
        this.playersByClientKey.delete(clientKey)
      }

      this.roomIndexKeys.delete(gameId)

      return
    }

    for (const [inviteCode, room] of this.roomsByInviteCode) {
      if (room.gameId === gameId) this.roomsByInviteCode.delete(inviteCode)
    }

    for (const [socketId, room] of this.roomsByManagerSocketId) {
      if (room.gameId === gameId) this.roomsByManagerSocketId.delete(socketId)
    }

    for (const [socketId, room] of this.roomsByPlayerSocketId) {
      if (room.gameId === gameId) this.roomsByPlayerSocketId.delete(socketId)
    }

    for (const [socketId, indexedGameId] of this.playerSocketRoomIds) {
      if (indexedGameId === gameId) {
        this.playersBySocketId.delete(socketId)
        this.playerSocketRoomIds.delete(socketId)
      }
    }

    for (const [clientKey, room] of this.roomsByPlayerClientKey) {
      if (room.gameId === gameId) this.roomsByPlayerClientKey.delete(clientKey)
    }

    for (const [clientKey] of this.playersByClientKey) {
      if (clientKey.startsWith(`${gameId}:`)) {
        this.playersByClientKey.delete(clientKey)
      }
    }
  }

  playerClientKey(gameId, clientId) {
    return `${gameId}:${clientId}`
  }

  indexRoom(room) {
    this.removeRoomIndexes(room.gameId)
    this.roomsByInviteCode.set(room.inviteCode, room)
    const keys = {
      inviteCode: room.inviteCode,
      managerSocketId: room.manager?.id ?? null,
      playerSocketIds: new Set(),
      playerClientKeys: new Set(),
    }

    if (room.manager?.id) {
      this.roomsByManagerSocketId.set(room.manager.id, room)
    }

    for (const player of room.players ?? []) {
      if (player.id) {
        this.roomsByPlayerSocketId.set(player.id, room)
        this.playersBySocketId.set(player.id, player)
        this.playerSocketRoomIds.set(player.id, room.gameId)
        keys.playerSocketIds.add(player.id)
      }

      if (player.clientId) {
        const clientKey = this.playerClientKey(room.gameId, player.clientId)
        this.roomsByPlayerClientKey.set(clientKey, room)
        this.playersByClientKey.set(clientKey, player)
        keys.playerClientKeys.add(clientKey)
      }
    }

    this.roomIndexKeys.set(room.gameId, keys)
  }

  resolveIndexedRoom(index, key, predicate) {
    const indexedRoom = index.get(key)

    if (!indexedRoom) {
      return undefined
    }

    const currentRoom = this.store.get(indexedRoom.gameId)

    if (currentRoom && predicate(currentRoom)) {
      if (currentRoom !== indexedRoom) {
        this.indexRoom(currentRoom)
      }

      return currentRoom
    }

    index.delete(key)
    return undefined
  }

  persistRoom(room) {
    this.store.set(room.gameId, room)
    this.indexRoom(room)

    return room
  }

  createRoom({ managerSocketId, managerClientId, organizationId = null, hostedBy = null }) {
    if (this.getRoomByManagerSocketId(managerSocketId)) {
      throw new GameError('Manager already has an active game')
    }

    if ([...this.store.values()].length >= this.maxActiveRooms) {
      throw new GameError('Server is busy; try again later')
    }

    let inviteCode = createInviteCode()

    while (this.getRoomByInviteCode(inviteCode)) {
      inviteCode = createInviteCode()
    }

    const room = {
      gameId: uuid(),
      inviteCode,
      organizationId,
      hostedBy,
      manager: {
        id: managerSocketId,
        clientId: managerClientId,
        connected: true,
      },
      players: [],
      engine: null,
    }

    this.persistRoom(room)
    this.bus.publish(BUS.ROOM_CREATED, { gameId: room.gameId, inviteCode })

    return room
  }

  getRoom(gameId) {
    return gameId ? this.store.get(gameId) : undefined
  }

  getRoomByInviteCode(inviteCode) {
    const indexed = this.resolveIndexedRoom(
      this.roomsByInviteCode,
      inviteCode,
      (room) => room.inviteCode === inviteCode,
    )

    if (indexed) {
      return indexed
    }

    for (const room of this.store.values()) {
      if (room.inviteCode === inviteCode) {
        this.indexRoom(room)
        return room
      }
    }

    return undefined
  }

  getRoomByManagerSocketId(socketId) {
    const indexed = this.resolveIndexedRoom(
      this.roomsByManagerSocketId,
      socketId,
      (room) => room.manager.id === socketId,
    )

    if (indexed) {
      return indexed
    }

    for (const room of this.store.values()) {
      if (room.manager.id === socketId) {
        this.indexRoom(room)
        return room
      }
    }

    return undefined
  }

  getRoomByPlayerSocketId(socketId) {
    const indexed = this.resolveIndexedRoom(
      this.roomsByPlayerSocketId,
      socketId,
      (room) => room.players.some((p) => p.id === socketId),
    )

    if (indexed) {
      return indexed
    }

    for (const room of this.store.values()) {
      if (room.players.some((p) => p.id === socketId)) {
        this.indexRoom(room)
        return room
      }
    }

    return undefined
  }

  getPlayerBySocketId(room, socketId) {
    if (!room || !socketId) {
      return undefined
    }

    const indexedPlayer = this.playersBySocketId.get(socketId)

    if (indexedPlayer && indexedPlayer.id === socketId && room.players.includes(indexedPlayer)) {
      return indexedPlayer
    }

    const player = room.players.find((p) => p.id === socketId)

    if (player) {
      this.indexRoom(room)
    } else {
      this.roomsByPlayerSocketId.delete(socketId)
      this.playersBySocketId.delete(socketId)
      this.playerSocketRoomIds.delete(socketId)
    }

    return player
  }

  /** Room only if the clientId belongs to one of its players (reconnect lookup). */
  getPlayerRoom(gameId, clientId) {
    const clientKey = this.playerClientKey(gameId, clientId)
    const indexed = this.resolveIndexedRoom(
      this.roomsByPlayerClientKey,
      clientKey,
      (room) => room.gameId === gameId && Boolean(this.getPlayerByClientId(room, clientId)),
    )

    if (indexed) {
      return indexed
    }

    const room = this.getRoom(gameId)

    if (room && room.players.some((p) => p.clientId === clientId)) {
      this.indexRoom(room)

      return room
    }

    return undefined
  }

  getPlayerByClientId(room, clientId) {
    if (!room || !clientId) {
      return undefined
    }

    const clientKey = this.playerClientKey(room.gameId, clientId)
    const indexedPlayer = this.playersByClientKey.get(clientKey)

    if (
      indexedPlayer &&
      indexedPlayer.clientId === clientId &&
      room.players.includes(indexedPlayer)
    ) {
      return indexedPlayer
    }

    const player = room.players.find((p) => p.clientId === clientId)

    if (player) {
      this.indexRoom(room)
    } else {
      this.roomsByPlayerClientKey.delete(clientKey)
      this.playersByClientKey.delete(clientKey)
    }

    return player
  }

  /** Room only if the clientId is its manager (reconnect lookup). */
  getManagerRoom(gameId, clientId) {
    const room = this.getRoom(gameId)

    return room && room.manager.clientId === clientId ? room : undefined
  }

  addPlayer(room, player) {
    if (room.players.length >= this.maxPlayersPerRoom) {
      throw new GameError('Room is full')
    }

    room.players.push(player)
    this.persistRoom(room)
  }

  setMaxPlayersPerRoom(maxPlayersPerRoom) {
    this.maxPlayersPerRoom = maxPlayersPerRoom
  }

  removePlayer(room, playerId) {
    if (!room.players.some((p) => p.id === playerId)) {
      return undefined
    }

    room.players = room.players.filter((p) => p.id !== playerId)
    this.persistRoom(room)

    return room
  }

  setEngine(room, engine) {
    room.engine = engine
    this.persistRoom(room)
  }

  markManagerDisconnected(room) {
    if (!room.manager.connected) {
      return undefined
    }

    room.manager.connected = false
    this.markEmpty(room.gameId)
    this.persistRoom(room)

    return room.manager
  }

  reconnectManager(room, socketId) {
    if (room.manager.connected && room.manager.id === socketId) {
      return undefined
    }

    room.manager.id = socketId
    room.manager.connected = true
    this.reactivate(room.gameId)
    this.persistRoom(room)

    return room.manager
  }

  markPlayerDisconnected(room, socketId) {
    const player = this.getPlayerBySocketId(room, socketId)

    if (!player || !player.connected) {
      return undefined
    }

    player.connected = false
    this.persistRoom(room)

    return player
  }

  reconnectPlayer(room, clientId, socketId) {
    const player = this.getPlayerByClientId(room, clientId)

    if (!player || (player.connected && player.id === socketId)) {
      return undefined
    }

    const oldSocketId = player.id
    player.id = socketId
    player.connected = true
    this.persistRoom(room)

    return { player, oldSocketId }
  }

  markEmpty(gameId) {
    if (!this.emptySince.has(gameId)) {
      this.emptySince.set(gameId, Date.now())
    }
  }

  reactivate(gameId) {
    this.emptySince.delete(gameId)
  }

  destroyRoom(gameId) {
    const room = this.getRoom(gameId)

    if (!room) {
      return
    }

    room.engine?.destroy()
    this.store.delete(gameId)
    this.removeRoomIndexes(gameId)
    this.roomActionQueues.delete(gameId)
    this.emptySince.delete(gameId)
    this.bus.closeRoom?.(gameId)
    this.bus.publish(BUS.ROOM_DESTROYED, { gameId })
  }

  /** Reap rooms whose manager has been gone longer than the timeout. */
  sweepEmptyRooms() {
    const now = Date.now()

    for (const [gameId, since] of this.emptySince) {
      if (now - since >= this.emptyGameTimeoutMs) {
        this.destroyRoom(gameId)
      }
    }
  }

  shutdown() {
    clearInterval(this.sweepInterval)

    for (const room of [...this.store.values()]) {
      this.destroyRoom(room.gameId)
    }

    this.roomActionQueues.clear()
  }

  enqueueRoomAction(gameId, action) {
    const previous = this.roomActionQueues.get(gameId) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(action)
      .finally(() => {
        if (this.roomActionQueues.get(gameId) === next) {
          this.roomActionQueues.delete(gameId)
        }
      })

    this.roomActionQueues.set(gameId, next)

    return next
  }

  stats() {
    const rooms = [...this.store.values()]
    const players = rooms.flatMap((room) => room.players ?? [])

    return {
      rooms: rooms.length,
      players: players.length,
      connectedPlayers: players.filter((player) => player.connected).length,
      maxActiveRooms: this.maxActiveRooms,
      maxPlayersPerRoom: this.maxPlayersPerRoom,
      queuedRoomActions: this.roomActionQueues.size,
    }
  }
}
