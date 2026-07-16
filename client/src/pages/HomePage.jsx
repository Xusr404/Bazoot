import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { JoinRoomScreen, JoinUsernameScreen } from '../screens/index.js'

// Player landing page: PIN form, then username form, then navigate into the
// game (source PlayerAuthPage + join flow).
export const HomePage = () => {
  const navigate = useNavigate()
  const { isConnected, connect, player, dispatch } = useGame()
  const pendingUsername = useRef('')
  const pendingAvatar = useRef(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (message) => {
    setErrorMessage(message)
    toast.error(message)
  })

  // PIN accepted → remember the game and switch to the username form.
  useSocketEvent(EVENTS.GAME_SUCCESS_ROOM, (gameId) => {
    setErrorMessage('')
    dispatch({ type: 'SET_GAME_ID', gameId })
    dispatch({ type: 'SET_PLAYER', player: { points: 0 } })
  })

  // Username accepted → seed WAIT status and enter the party.
  useSocketEvent(EVENTS.GAME_SUCCESS_JOIN, (gameId) => {
    setErrorMessage('')
    dispatch({
      type: 'SET_PLAYER',
      player: { username: pendingUsername.current, avatar: pendingAvatar.current, points: 0 },
    })
    dispatch({
      type: 'SET_STATUS',
      name: STATUS.WAIT,
      data: { text: 'Waiting for the players' },
    })
    navigate(`/party/${gameId}`)
  })

  return (
    <AuthShell isConnected={isConnected}>
      {player ? (
        <JoinUsernameScreen
          errorMessage={errorMessage}
          onChange={() => setErrorMessage('')}
          onSubmit={(username, avatar) => {
            pendingUsername.current = username
            pendingAvatar.current = avatar
          }}
        />
      ) : (
        <JoinRoomScreen errorMessage={errorMessage} onChange={() => setErrorMessage('')} />
      )}
    </AuthShell>
  )
}
