import { EVENTS } from '@bazoot/shared/events'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router'
import { ReactionsOverlay } from '../components/game/ReactionsOverlay.jsx'
import { ArrowLeftIcon, DotsVerticalIcon, ExpandIcon, XCircleIcon } from '../components/icons/ui.jsx'
import { GameFrame } from '../components/layout/GameFrame.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Menu } from '../components/ui/Menu.jsx'
import { ScreenErrorBoundary } from '../components/ui/ScreenErrorBoundary.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSocketEvent } from '../hooks/useSocket.js'
import { MANAGER_SCREENS, MANAGER_SKIP_BTN, MANAGER_SKIP_EVENTS } from '../screens/index.js'
import { RouteNotFoundPage } from './RouteNotFoundPage.jsx'

// In-game page for the manager: status-driven screens + the Start/Skip/Next
// button (source ManagerGamePage + GameWrapper).
export const ManagerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams()
  const {
    isConnected,
    connect,
    status,
    questionProgress,
    dispatch,
    reconnect,
    managerAdvance,
    endGame,
  } = useGame()
  const { t } = useTranslation()
  const [isDisabled, setIsDisabled] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [missingGame, setMissingGame] = useState(false)

  useEffect(() => {
    setMissingGame(false)
  }, [gameIdParam])

  useEffect(() => {
    if (!isConnected) {
      connect()
    } else if (gameIdParam && !status) {
      reconnect(gameIdParam)
    }
  }, [connect, gameIdParam, isConnected, reconnect, status])

  useSocketEvent(
    EVENTS.MANAGER_SUCCESS_RECONNECT,
    ({ gameId, status: restored, players, currentQuestion }) => {
      dispatch({ type: 'SET_GAME_ID', gameId })
      dispatch({ type: 'SET_STATUS', name: restored.name, data: restored.data })
      dispatch({ type: 'SET_PLAYERS', players })
      dispatch({ type: 'SET_QUESTION_PROGRESS', progress: currentQuestion })
    },
  )

  useSocketEvent(EVENTS.GAME_RESET, (message) => {
    dispatch({ type: 'RESET' })
    if (message === 'Game not found') {
      setMissingGame(true)

      return
    }

    navigate('/manager')
    toast.error(t(message))
  })

  useSocketEvent(EVENTS.MANAGER_GAME_ENDED, () => {
    navigate('/manager')
    dispatch({ type: 'RESET' })
    toast.success(t('Game ended'))
  })

  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (message) => {
    toast.error(t(message))
    setIsDisabled(false)
  })

  // Re-enable the next button whenever the game moves on.
  useEffect(() => {
    setIsDisabled(false)
  }, [status?.name])

  const next = status ? (MANAGER_SKIP_BTN[status.name] ?? null) : null

  const handleNext = () => {
    if (!status) {
      return
    }

    const event = MANAGER_SKIP_EVENTS[status.name]

    if (event) {
      setIsDisabled(true)
      managerAdvance(event)
    }
  }

  const Screen = status ? MANAGER_SCREENS[status.name] : null
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  const toolbar = (
    <Menu
      align="right"
      menuLabel={t('Game controls')}
      items={[
        {
          label: t('Return to manager'),
          icon: <ArrowLeftIcon className="h-4 w-4" />,
          onSelect: () => navigate('/manager'),
        },
        {
          label: document.fullscreenElement ? t('Exit fullscreen') : t('Fullscreen'),
          icon: <ExpandIcon className="h-4 w-4" />,
          onSelect: toggleFullscreen,
        },
        { separator: true },
        {
          label: t('End game'),
          icon: <XCircleIcon className="h-4 w-4" />,
          danger: true,
          onSelect: () => setConfirmEnd(true),
        },
      ]}
      renderTrigger={({ open, triggerProps }) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={t('Game controls')}
          className={clsx(
            'flex h-11 w-11 items-center justify-center rounded-md bg-white text-gray-800 shadow-md transition-colors',
            'hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            open && 'bg-gray-100',
          )}
        >
          <DotsVerticalIcon className="h-5 w-5" />
        </button>
      )}
    />
  )

  return (
    <>
      {missingGame ? (
        <RouteNotFoundPage scope="manager" backTo="/manager" />
      ) : (
        <>
          <GameFrame
            isConnected={isConnected}
            statusName={status?.name}
            questionProgress={questionProgress}
            manager
            next={next ? t(next) : null}
            isNextDisabled={isDisabled}
            onNext={handleNext}
            toolbar={toolbar}
          >
            {Screen && (
              <ScreenErrorBoundary key={status.name}>
                <Screen />
              </ScreenErrorBoundary>
            )}
          </GameFrame>

          <ReactionsOverlay />

          <ConfirmDialog
            open={confirmEnd}
            title={t('End this game?')}
            confirmLabel={t('End game')}
            cancelLabel={t('Keep hosting')}
            danger
            onConfirm={() => {
              setConfirmEnd(false)
              endGame()
            }}
            onCancel={() => setConfirmEnd(false)}
          >
            {t('Players will be disconnected and this live session cannot be resumed.')}
          </ConfirmDialog>
        </>
      )}
    </>
  )
}
