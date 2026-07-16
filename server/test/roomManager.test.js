import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { BUS, GameEventBus } from '../src/game/GameEventBus.js'
import { MemoryRoomStore } from '../src/rooms/MemoryRoomStore.js'
import { RoomManager } from '../src/rooms/RoomManager.js'
import { GameError } from '../src/utils/errors.js'

const managers = []

class RecordingRoomStore extends MemoryRoomStore {
  constructor() {
    super()
    this.setCalls = []
  }

  set(gameId, room) {
    this.setCalls.push({
      gameId,
      engine: Boolean(room.engine),
      manager: { ...room.manager },
      players: room.players.map((player) => ({ ...player })),
    })
    super.set(gameId, room)
  }
}

const deferred = () => {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })

  return { promise, resolve }
}

const immediate = () => new Promise((resolve) => setImmediate(resolve))

const makeManager = (overrides = {}) => {
  const manager = new RoomManager({
    store: new MemoryRoomStore(),
    bus: new GameEventBus(),
    maxPlayersPerRoom: 2,
    emptyGameTimeoutMs: 0,
    sweepIntervalMs: 3_600_000,
    ...overrides,
  })
  managers.push(manager)

  return manager
}

afterEach(() => {
  while (managers.length) {
    managers.pop().shutdown()
  }
})

describe('RoomManager', () => {
  it('creates rooms with 6-digit invite codes and unique ids', () => {
    const manager = makeManager()
    const a = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })
    const b = manager.createRoom({ managerSocketId: 's2', managerClientId: 'c2' })

    assert.match(a.inviteCode, /^\d{6}$/)
    assert.notEqual(a.gameId, b.gameId)
    assert.equal(manager.getRoomByInviteCode(a.inviteCode), a)
    assert.equal(manager.getRoomByManagerSocketId('s2'), b)
  })

  it('rejects duplicate active rooms for one manager socket', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    assert.throws(
      () => manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' }),
      /Manager already has an active game/,
    )
    assert.equal(manager.getRoomByManagerSocketId('s1'), room)
    assert.equal([...manager.store.values()].length, 1)
  })

  it('enforces the active room cap', () => {
    const manager = makeManager({ maxActiveRooms: 1 })

    manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })
    assert.throws(
      () => manager.createRoom({ managerSocketId: 's2', managerClientId: 'c2' }),
      /Server is busy/,
    )
  })

  it('indexes player socket changes without scanning stale socket ids', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'mgr' })

    manager.addPlayer(room, { id: 'p1', clientId: 'alice', connected: true })
    assert.equal(manager.getRoomByPlayerSocketId('p1'), room)
    assert.equal(manager.getPlayerBySocketId(room, 'p1'), room.players[0])
    assert.equal(manager.getPlayerRoom(room.gameId, 'alice'), room)
    assert.equal(manager.getPlayerByClientId(room, 'alice'), room.players[0])

    const reconnect = manager.reconnectPlayer(room, 'alice', 'p1-new')

    assert.equal(reconnect.oldSocketId, 'p1')
    assert.equal(manager.getRoomByPlayerSocketId('p1'), undefined)
    assert.equal(manager.getRoomByPlayerSocketId('p1-new'), room)
    assert.equal(manager.getPlayerBySocketId(room, 'p1-new'), room.players[0])
    assert.equal(manager.getPlayerRoom(room.gameId, 'alice'), room)
    assert.equal(manager.getPlayerByClientId(room, 'alice'), room.players[0])

    manager.removePlayer(room, 'p1-new')
    assert.equal(manager.getRoomByPlayerSocketId('p1-new'), undefined)
    assert.equal(manager.getPlayerBySocketId(room, 'p1-new'), undefined)
    assert.equal(manager.getPlayerRoom(room.gameId, 'alice'), undefined)
    assert.equal(manager.getPlayerByClientId(room, 'alice'), undefined)
  })

  it('tracks per-room index keys across socket churn and room destruction', () => {
    const manager = makeManager({ maxPlayersPerRoom: 4 })
    const room = manager.createRoom({ managerSocketId: 'm1', managerClientId: 'mgr-1' })
    const otherRoom = manager.createRoom({ managerSocketId: 'm2', managerClientId: 'mgr-2' })
    manager.addPlayer(room, { id: 'p1', clientId: 'alice', connected: true })
    manager.addPlayer(room, { id: 'p2', clientId: 'bob', connected: true })
    manager.addPlayer(otherRoom, { id: 'p-other', clientId: 'other', connected: true })

    assert.equal(manager.roomIndexKeys.get(room.gameId).playerSocketIds.size, 2)
    assert.equal(manager.roomIndexKeys.get(room.gameId).playerClientKeys.size, 2)
    assert.equal(
      manager.playersByClientKey.get(`${room.gameId}:alice`),
      room.players.find((player) => player.clientId === 'alice'),
    )

    manager.reconnectPlayer(room, 'alice', 'p1-new')
    manager.reconnectManager(room, 'm1-new')

    assert.equal(manager.getRoomByPlayerSocketId('p1'), undefined)
    assert.equal(manager.getRoomByPlayerSocketId('p1-new'), room)
    assert.equal(manager.getRoomByManagerSocketId('m1'), undefined)
    assert.equal(manager.getRoomByManagerSocketId('m1-new'), room)

    const keys = manager.roomIndexKeys.get(room.gameId)
    assert.equal(keys.managerSocketId, 'm1-new')
    assert.deepEqual([...keys.playerSocketIds].sort(), ['p1-new', 'p2'])
    assert.deepEqual([...keys.playerClientKeys].sort(), [
      `${room.gameId}:alice`,
      `${room.gameId}:bob`,
    ])

    manager.removePlayer(room, 'p2')

    assert.equal(manager.getRoomByPlayerSocketId('p2'), undefined)
    assert.equal(manager.getPlayerRoom(room.gameId, 'bob'), undefined)
    assert.equal(manager.getRoomByPlayerSocketId('p-other'), otherRoom)
    assert.equal(manager.getPlayerRoom(otherRoom.gameId, 'other'), otherRoom)

    manager.destroyRoom(room.gameId)

    assert.equal(manager.roomIndexKeys.has(room.gameId), false)
    assert.equal(manager.getRoomByManagerSocketId('m1-new'), undefined)
    assert.equal(manager.getRoomByPlayerSocketId('p1-new'), undefined)
    assert.equal(manager.getPlayerRoom(room.gameId, 'alice'), undefined)
    assert.equal(manager.playersByClientKey.has(`${room.gameId}:alice`), false)
    assert.equal(manager.getRoomByInviteCode(otherRoom.inviteCode), otherRoom)
  })

  it('persists room presence and engine changes through the store', () => {
    const store = new RecordingRoomStore()
    const manager = makeManager({ store })
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'mgr' })

    manager.addPlayer(room, { id: 'p1', clientId: 'alice', connected: true })
    manager.setEngine(room, { destroy: () => {} })
    manager.markManagerDisconnected(room)
    manager.markPlayerDisconnected(room, 'p1')
    manager.reconnectManager(room, 's1-new')

    assert.equal(store.setCalls.some((call) => call.engine), true)
    assert.equal(
      store.setCalls.some((call) => call.manager.id === 's1' && call.manager.connected === false),
      true,
    )
    assert.equal(
      store.setCalls.some((call) =>
        call.players.some((player) => player.id === 'p1' && player.connected === false),
      ),
      true,
    )
    assert.equal(
      store.setCalls.some((call) => call.manager.id === 's1-new' && call.manager.connected),
      true,
    )
  })

  it('does not persist unchanged presence mutations', () => {
    const store = new RecordingRoomStore()
    const manager = makeManager({ store })
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'mgr' })
    manager.addPlayer(room, { id: 'p1', clientId: 'alice', connected: true })
    store.setCalls = []

    assert.equal(manager.reconnectPlayer(room, 'alice', 'p1'), undefined)
    assert.equal(manager.removePlayer(room, 'missing'), undefined)
    assert.equal(store.setCalls.length, 0)

    assert.equal(manager.markPlayerDisconnected(room, 'p1')?.id, 'p1')
    assert.equal(manager.markPlayerDisconnected(room, 'p1'), undefined)

    assert.equal(manager.reconnectPlayer(room, 'alice', 'p1-new')?.oldSocketId, 'p1')
    assert.equal(manager.reconnectPlayer(room, 'alice', 'p1-new'), undefined)

    assert.equal(manager.markManagerDisconnected(room)?.id, 's1')
    assert.equal(manager.markManagerDisconnected(room), undefined)

    assert.equal(manager.reconnectManager(room, 's1-new')?.id, 's1-new')
    assert.equal(manager.reconnectManager(room, 's1-new'), undefined)

    assert.equal(store.setCalls.length, 4)
  })

  it('serializes per-room actions in arrival order', async () => {
    const manager = makeManager()
    const gate = deferred()
    const order = []

    const first = manager.enqueueRoomAction('game-1', async () => {
      order.push('first:start')
      await gate.promise
      order.push('first:end')
    })
    const second = manager.enqueueRoomAction('game-1', async () => {
      order.push('second')
    })

    await immediate()
    assert.deepEqual(order, ['first:start'])

    gate.resolve()
    await Promise.all([first, second])
    assert.deepEqual(order, ['first:start', 'first:end', 'second'])
  })

  it('enforces the player cap', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    manager.addPlayer(room, { id: 'p1', clientId: 'a' })
    manager.addPlayer(room, { id: 'p2', clientId: 'b' })
    assert.throws(() => manager.addPlayer(room, { id: 'p3', clientId: 'c' }), GameError)
    assert.equal(room.players.length, 2)
  })

  it('uses runtime player cap changes immediately', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    manager.setMaxPlayersPerRoom(3)
    manager.addPlayer(room, { id: 'p1', clientId: 'a' })
    manager.addPlayer(room, { id: 'p2', clientId: 'b' })
    manager.addPlayer(room, { id: 'p3', clientId: 'c' })

    assert.equal(room.players.length, 3)
  })

  it('scopes reconnect lookups to the right clientId', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'mgr' })
    manager.addPlayer(room, { id: 'p1', clientId: 'alice' })

    assert.equal(manager.getPlayerRoom(room.gameId, 'alice'), room)
    assert.equal(manager.getPlayerRoom(room.gameId, 'mallory'), undefined)
    assert.equal(manager.getManagerRoom(room.gameId, 'mgr'), room)
    assert.equal(manager.getManagerRoom(room.gameId, 'alice'), undefined)
  })

  it('reaps rooms whose manager stayed away past the timeout', () => {
    const manager = makeManager() // timeout 0 → eligible immediately
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    manager.markEmpty(room.gameId)
    manager.sweepEmptyRooms()
    assert.equal(manager.getRoom(room.gameId), undefined)
  })

  it('reactivate cancels the reaping', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    manager.markEmpty(room.gameId)
    manager.reactivate(room.gameId)
    manager.sweepEmptyRooms()
    assert.equal(manager.getRoom(room.gameId), room)
  })

  it('destroyRoom silences the engine', () => {
    const manager = makeManager()
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })
    let destroyed = false
    room.engine = { destroy: () => { destroyed = true } }

    manager.destroyRoom(room.gameId)
    assert.equal(destroyed, true)
    assert.equal(manager.getRoom(room.gameId), undefined)
  })

  it('clears socket room membership when destroying a room', () => {
    const bus = new GameEventBus()
    const closedRooms = []
    bus.on(BUS.CLOSE_ROOM, ({ gameId }) => {
      closedRooms.push(gameId)
    })
    const manager = makeManager({ bus })
    const room = manager.createRoom({ managerSocketId: 's1', managerClientId: 'c1' })

    manager.destroyRoom(room.gameId)

    assert.deepEqual(closedRooms, [room.gameId])
  })
})
