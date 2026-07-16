import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { GameFrame } from '../components/layout/GameFrame.jsx'
import { ScreenErrorBoundary } from '../components/ui/ScreenErrorBoundary.jsx'
import { Tag } from '../components/ui/Tag.jsx'
import { useGame } from '../context/GameContext.jsx'
import {
  MANAGER_SCREENS,
  MANAGER_SKIP_BTN,
  MANAGER_SKIP_EVENTS,
  PLAYER_SCREENS,
} from '../screens/screenMaps.js'
import { DemoGameProvider } from './DemoGameProvider.jsx'

const roleButton = (active) =>
  clsx(
    'rounded px-3 py-1 text-sm font-bold transition-colors',
    active ? 'bg-primary shadow-inset text-white' : 'text-white/70 hover:bg-white/10',
  )

const bannerButton =
  'rounded px-3 py-1 text-sm font-bold text-white/80 outline outline-white/30 hover:bg-white/10'

// The in-game stage: status → screen exactly like the live manager/player
// pages, but read from the demo context (so the screens stay unchanged).
const DemoStage = ({ role }) => {
  const { status, questionProgress, player, managerAdvance } = useGame()

  const screens = role === 'manager' ? MANAGER_SCREENS : PLAYER_SCREENS
  const Screen = status ? screens[status.name] : null
  const next = role === 'manager' && status ? (MANAGER_SKIP_BTN[status.name] ?? null) : null

  return (
    <GameFrame
      fullScreen={false}
      isConnected
      statusName={status?.name}
      questionProgress={questionProgress}
      manager={role === 'manager'}
      next={next}
      onNext={() => managerAdvance(MANAGER_SKIP_EVENTS[status.name])}
      playerUsername={player?.username}
      playerPoints={player?.points}
    >
      {Screen && (
        <ScreenErrorBoundary key={`${role}-${status.name}`}>
          <Screen />
        </ScreenErrorBoundary>
      )}
    </GameFrame>
  )
}

// Fullscreen demo run on top of the wizard (which stays mounted, so the
// draft is untouched). Banner: demo marker, host/player view switch, restart,
// exit. Entirely client-side — no server traffic, nothing persisted.
export const DemoRunOverlay = ({ quizz, onExit }) => {
  const [role, setRole] = useState('manager')
  const [runId, setRunId] = useState(0)
  // Snapshot of the draft as it was when the demo opened — a stable identity
  // so re-renders of the wizard behind the overlay never restart the engine.
  const [frozenQuizz] = useState(quizz)

  // The page behind the overlay must not scroll while the demo is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="bg-secondary fixed inset-0 z-[150] flex flex-col" role="dialog" aria-label="Demo run">
      <header className="border-primary/60 bg-secondary relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Tag tone="warning">DEMO</Tag>
          <span className="hidden text-sm font-bold text-white/80 sm:inline">
            Test run — nothing is saved
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-md bg-white/10 p-1" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={role === 'manager'}
            className={roleButton(role === 'manager')}
            onClick={() => setRole('manager')}
          >
            Host view
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={role === 'player'}
            className={roleButton(role === 'player')}
            onClick={() => setRole('player')}
          >
            Player view
          </button>
        </div>

        <span className="hidden text-xs font-semibold text-white/50 md:inline">
          {role === 'player'
            ? 'The host advances automatically while you play.'
            : 'You control the game — “You” and the bots answer for the players.'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={bannerButton} onClick={() => setRunId((id) => id + 1)}>
            ⟲ Restart
          </button>
          <button
            type="button"
            className={clsx(bannerButton, 'bg-primary text-white outline-none')}
            onClick={onExit}
          >
            Exit demo
          </button>
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1">
        <DemoGameProvider key={runId} quizz={frozenQuizz} role={role}>
          <DemoStage role={role} />
        </DemoGameProvider>
      </div>
    </div>
  )
}
