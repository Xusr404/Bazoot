import { resolveAvatar } from '@bazoot/shared/avatars'
import { EVENTS } from '@bazoot/shared/events'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router'
import { ReactionBar } from '../components/game/ReactionBar.jsx'
import { ReactionsOverlay } from '../components/game/ReactionsOverlay.jsx'
import { GameFrame } from '../components/layout/GameFrame.jsx'
import { ScreenErrorBoundary } from '../components/ui/ScreenErrorBoundary.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSocketEvent } from '../hooks/useSocket.js'
import { PLAYER_SCREENS } from '../screens/index.js'
import { RouteNotFoundPage } from './RouteNotFoundPage.jsx'

// In-game page for players: renders whichever screen matches the server status
// (source PlayerGamePage + GameWrapper).
export const PlayerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams()
  const { t } = useTranslation()
  const { isConnected, status, player, questionProgress, dispatch, reconnect } = useGame()
  const [missingGame, setMissingGame] = useState(false)

  useEffect(() => {
    setMissingGame(false)
  }, [gameIdParam])

  // Fresh page load (refresh/deep link): socket connects → resume the session.
  useSocketEvent('connect', () => {
    if (gameIdParam) {
      reconnect(gameIdParam)
    }
  })

  useSocketEvent(
    EVENTS.PLAYER_SUCCESS_RECONNECT,
    ({ gameId, status: restored, player: restoredPlayer, currentQuestion }) => {
      dispatch({ type: 'SET_GAME_ID', gameId })
      dispatch({ type: 'SET_STATUS', name: restored.name, data: restored.data })
      dispatch({ type: 'SET_PLAYER', player: restoredPlayer })
      dispatch({ type: 'SET_QUESTION_PROGRESS', progress: currentQuestion })
    },
  )

  useSocketEvent(EVENTS.GAME_RESET, (message) => {
    dispatch({ type: 'RESET' })
    if (message === 'Game not found') {
      setMissingGame(true)

      return
    }

    navigate('/')
    toast.error(t(message))
  })

  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (message) => {
    toast.error(t(message))
  })

  if (!gameIdParam) {
    return null
  }

  if (missingGame) {
    return <RouteNotFoundPage scope="party" backTo="/" />
  }

  const Screen = status ? PLAYER_SCREENS[status.name] : null

  return (
    <>
      <GameFrame
        isConnected={isConnected}
        statusName={status?.name}
        questionProgress={questionProgress}
        playerUsername={player?.username}
        playerAvatar={player ? resolveAvatar(player) : undefined}
        playerPoints={player?.points}
      >
        {Screen ? (
          <ScreenErrorBoundary key={status.name}>
            <Screen />
          </ScreenErrorBoundary>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
            <div className="max-w-md rounded-2xl border border-white/20 bg-black/35 px-6 py-8 text-white shadow-2xl backdrop-blur-sm">
              <p className="text-xs font-bold tracking-[0.3em] text-orange-300 uppercase">
                {t('Shared game')}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{t('Looking up game…')}</h2>
              <p className="mt-2 text-sm font-semibold text-white/80">
                {t('Checking whether that shared game is still available.')}
              </p>
            </div>
          </div>
        )}
      </GameFrame>

      <ReactionsOverlay />
      {status && <ReactionBar />}
    </>
  )
}
