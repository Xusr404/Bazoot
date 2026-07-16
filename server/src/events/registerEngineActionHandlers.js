const engineActionContext = ({ gameId, action }) => `${action} for game ${gameId}`
const SERIALIZED_ENGINE_ACTIONS = new Set([
  'start',
  'removePlayerStatus',
  'abortRound',
  'nextQuestion',
  'showLeaderboard',
  'resetGame',
  'managerReconnectStatus',
  'questionProgress',
])

export const runEngineAction = async (roomManager, { gameId, action, args = [] }) => {
  const room = roomManager.getRoom(gameId)
  const engineAction = room?.engine?.[action]

  if (typeof engineAction !== 'function') {
    return null
  }

  const run = () => engineAction.apply(room.engine, Array.isArray(args) ? args : [])

  if (SERIALIZED_ENGINE_ACTIONS.has(action) && roomManager.enqueueRoomAction) {
    return roomManager.enqueueRoomAction(gameId, run)
  }

  return run()
}

export const registerEngineActionHandlers = ({ io, roomManager }) => {
  io.on('engine:action', (payload) => {
    void runEngineAction(roomManager, payload).catch((error) => {
      console.error(`Remote engine action ${engineActionContext(payload)} failed:`, error)
    })
  })

  io.on('engine:action:rpc', async (payload, callback) => {
    try {
      callback(await runEngineAction(roomManager, payload))
    } catch (error) {
      console.error(`Remote engine RPC ${engineActionContext(payload)} failed:`, error)
      callback(null)
    }
  })
}
