import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useSocket } from '../hooks/useSocket.js'

// App shell: page background + socket connection (source GameLayout).
export const RootLayout = () => {
  const { isConnected, connect } = useSocket()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useEffect(() => {
    document.body.classList.add('bg-secondary')

    return () => {
      document.body.classList.remove('bg-secondary')
    }
  }, [])

  return (
    <div className="antialiased bg-secondary">
      <Outlet />
    </div>
  )
}
