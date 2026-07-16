import { EVENTS } from '@bazoot/shared/events'
import clsx from 'clsx'
import { useState } from 'react'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useSfx } from '../hooks/useSound.js'
import { animations } from '../tokens/index.js'

// SHOW_START — quiz subject title, then the rotating countdown square
// (45° per tick) with the seconds number overlaid (source Start + StartView).
export const StartScreen = () => {
  const { status } = useGame()
  const { time, subject } = status.data

  const [showTitle, setShowTitle] = useState(true)
  const [cooldown, setCooldown] = useState(time)
  const [sfxBoump] = useSfx('boump')

  useSocketEvent(EVENTS.GAME_START_COOLDOWN, () => {
    sfxBoump()
    setShowTitle(false)
  })

  useSocketEvent(EVENTS.GAME_COOLDOWN, (sec) => {
    sfxBoump()
    setCooldown(sec)
  })

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {showTitle ? (
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {subject}
        </h2>
      ) : (
        <>
          <div
            className={clsx('anim-show bg-primary aspect-square h-32 transition-all md:h-60')}
            style={{
              transform: `rotate(${animations.startSquareRotationPerTick * (time - cooldown)}deg)`,
            }}
          ></div>
          <span className="absolute text-6xl font-bold text-white drop-shadow-md md:text-8xl">
            {cooldown}
          </span>
        </>
      )}
    </section>
  )
}
