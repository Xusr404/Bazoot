import { resolveAvatar } from '@bazoot/shared/avatars'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AnimatedPoints } from '../components/game/AnimatedPoints.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { animations } from '../tokens/index.js'

// SHOW_LEADERBOARD (manager) — top-5 rows. Renders the OLD board first, swaps
// to the new one after 1.6s: spring row reorder + points count-up
// (source Leaderboard, motion/react).
export const LeaderboardScreen = () => {
  const { status } = useGame()
  const { t } = useTranslation()
  const { oldLeaderboard, leaderboard } = status.data

  const [displayedLeaderboard, setDisplayedLeaderboard] = useState(oldLeaderboard)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setDisplayedLeaderboard(oldLeaderboard)
    setIsAnimating(false)

    const timer = setTimeout(() => {
      setIsAnimating(true)
      setDisplayedLeaderboard(leaderboard)
    }, animations.leaderboard.swapDelay)

    return () => {
      clearTimeout(timer)
    }
  }, [oldLeaderboard, leaderboard])

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-2">
      <h2 className="mb-6 text-5xl font-bold text-white drop-shadow-md">{t('Leaderboard')}</h2>
      <div className="flex w-full flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {displayedLeaderboard.map((entry) => (
            <motion.div
              key={entry.id}
              layout
              initial={animations.leaderboard.enter}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                ...animations.leaderboard.enter,
                transition: { duration: animations.leaderboard.exitDuration / 1000 },
              }}
              transition={{
                layout: animations.leaderboard.rowSpring,
              }}
              className="bg-primary flex w-full items-center justify-between gap-3 rounded-md p-3 text-2xl font-bold text-white"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="text-3xl leading-none" aria-hidden="true">
                  {resolveAvatar(entry)}
                </span>
                <span className="truncate drop-shadow-md">{entry.username}</span>
              </span>
              {isAnimating ? (
                <AnimatedPoints
                  from={oldLeaderboard.find((u) => u.id === entry.id)?.points || 0}
                  to={leaderboard.find((u) => u.id === entry.id)?.points || 0}
                />
              ) : (
                <span className="drop-shadow-md">{entry.points}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}
