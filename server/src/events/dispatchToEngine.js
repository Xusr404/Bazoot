export const DEFAULT_ENGINE_RPC_TIMEOUT_MS = 2_000

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export const dispatchToEngine = async (
  room,
  io,
  gameId,
  action,
  args = [],
  expectAck = false,
  { timeoutMs = DEFAULT_ENGINE_RPC_TIMEOUT_MS } = {},
) => {
  if (room.engine) {
    if (typeof room.engine[action] === 'function') {
      return room.engine[action](...args)
    }
    return null
  }

  if (expectAck && io.serverSideEmitWithAck) {
    try {
      const responses = await withTimeout(
        io.serverSideEmitWithAck('engine:action:rpc', { gameId, action, args }),
        timeoutMs,
        `RPC ${action} timed out after ${timeoutMs}ms`,
      )
      return responses.find((r) => r !== null) ?? null
    } catch (err) {
      console.error(`RPC ${action} failed:`, err)
      return null
    }
  } else if (!expectAck && io.serverSideEmit) {
    io.serverSideEmit('engine:action', { gameId, action, args })
  }
}
