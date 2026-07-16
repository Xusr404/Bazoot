import { EVENTS } from '@bazoot/shared/events'
import { useCallback, useRef, useState } from 'react'
import { useSocketEvent } from '../../hooks/useSocket.js'

// Floating emoji reactions (engagement polish). Listens for GAME_REACTION and
// drifts each one up the screen, then drops it. Pointer-events-none so it never
// blocks the game underneath. Mounted on both the manager and player pages, so
// the host's projected screen and every player's phone show the same stream.
const FLOAT_MS = 2600
const MAX_ON_SCREEN = 30

export const ReactionsOverlay = () => {
  const [items, setItems] = useState([])
  const nextId = useRef(0)

  useSocketEvent(
    EVENTS.GAME_REACTION,
    useCallback(({ emoji, from }) => {
      const id = nextId.current
      nextId.current += 1

      const left = 6 + Math.random() * 80
      const drift = Math.round((Math.random() - 0.5) * 60)

      setItems((current) => [...current.slice(-(MAX_ON_SCREEN - 1)), { id, emoji, from, left, drift }])

      setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id))
      }, FLOAT_MS)
    }, []),
  )

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden="true">
      {items.map(({ id, emoji, from, left, drift }) => (
        <div
          key={id}
          className="reaction-float absolute bottom-20 flex flex-col items-center"
          style={{ left: `${left}%`, '--reaction-drift': `${drift}px` }}
        >
          <span className="text-5xl drop-shadow-lg">{emoji}</span>
          {from && (
            <span className="max-w-24 truncate rounded-full bg-black/40 px-2 text-xs font-bold text-white">
              {from}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
