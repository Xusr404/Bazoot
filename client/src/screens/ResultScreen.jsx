import { STREAK } from '@bazoot/shared/scoring'
import { useEffect } from 'react'
import { CircleCheck, CircleXmark } from '../components/icons/results.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSfx } from '../hooks/useSound.js'

// SHOW_RESULT — per-player correct/wrong feedback + rank + points delta
// (source Result + ResultView).
export const ResultScreen = () => {
  const { status, dispatch } = useGame()
  const { t } = useTranslation()
  const { correct, message, points, myPoints, rank, aheadOfMe, streak = 0, streakBonus = 0 } =
    status.data
  const showStreak = correct && streak >= STREAK.minForBonus
  const [sfxResults] = useSfx('results')

  useEffect(() => {
    dispatch({ type: 'UPDATE_POINTS', points: myPoints })
    sfxResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfxResults])

  return (
    <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {correct ? (
        <CircleCheck className="aspect-square max-h-60 w-full" />
      ) : (
        <CircleXmark className="aspect-square max-h-60 w-full" />
      )}
      <h2 className="mt-1 text-4xl font-bold text-white drop-shadow-lg">{t(message)}</h2>
      <p className="mt-1 text-xl font-bold text-white drop-shadow-lg">
        {t('You are top {rank}', { rank })}
        {aheadOfMe ? t(', behind {name}', { name: aheadOfMe }) : ''}
      </p>
      {correct && (
        <span className="mt-2 rounded bg-black/40 px-4 py-2 text-2xl font-bold text-white drop-shadow-lg">
          +{points}
        </span>
      )}
      {showStreak && (
        <span className="anim-show mt-2 flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-red-500 px-4 py-1.5 text-lg font-bold text-white drop-shadow-lg">
          <span className="text-xl">🔥</span>
          {t('{count} in a row!', { count: streak })}
          {streakBonus > 0 ? <span className="opacity-90">+{streakBonus}</span> : null}
        </span>
      )}
    </section>
  )
}
