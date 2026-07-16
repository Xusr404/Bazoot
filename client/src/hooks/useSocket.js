import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getClientId } from '../utils/clientId.js'

// Singleton connection (Phase 7A) — one socket for the whole app, same options
// as the source: same-origin, /ws path (proxied to the game server in dev).
let socketSingleton = null

export const getSocket = () => {
  socketSingleton ??= io('/', {
    path: '/ws',
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    auth: {
      clientId: getClientId(),
    },
  })

  return socketSingleton
}

/** Connection state + `emit`/`connect`. Components never touch socket.io directly. */
export const useSocket = () => {
  const socket = getSocket()
  const [isConnected, setIsConnected] = useState(socket.connected)

  useEffect(() => {
    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [socket])

  const connect = useCallback(() => {
    if (!socket.connected) {
      socket.connect()
    }
  }, [socket])

  const emit = useCallback(
    (event, payload) => {
      socket.emit(event, payload)
    },
    [socket],
  )

  return { isConnected, connect, emit }
}

// Where useSocketEvent subscribes. Defaults to the real socket; the demo run
// provides an in-memory emitter here so the game screens replay a simulated
// game without touching (or being disturbed by) the live connection.
export const SocketEventSourceContext = createContext(null)

/** Subscribe to a socket event for the lifetime of the component (auto-cleanup). */
export const useSocketEvent = (event, handler) => {
  const scopedSource = useContext(SocketEventSourceContext)

  useEffect(() => {
    const source = scopedSource ?? getSocket()
    source.on(event, handler)

    return () => {
      source.off(event, handler)
    }
  }, [scopedSource, event, handler])
}
