import { resolveAvatar } from '@bazoot/shared/avatars'
import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import ReactConfetti from 'react-confetti'
import { PodiumColumn } from '../components/game/PodiumColumn.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useScreenSize } from '../hooks/useScreenSize.js'
import { useSfx } from '../hooks/useSound.js'
import { useTranslation } from '../i18n/index.js'
import { animations } from '../tokens/index.js'

// Staged reveal: 1 = 3rd place, 2 = 2nd, 3 = 1st column + spotlight + snare
// roll, 4 = winner name + confetti. One stage every 2s (source usePodiumAnimation).
const usePodiumAnimation = (topLength) => {
  const [stage, setStage] = useState(0)
  const skip = useCallback(() => setStage(4), [])

  const [sfxThird] = useSfx('podiumThird')
  const [sfxSecond] = useSfx('podiumSecond')
  const [sfxRoll, { stop: sfxRollStop }] = useSfx('snareRoll')
  const [sfxFirst] = useSfx('podiumFirst')

  useEffect(() => {
    const actions = {
      4: () => {
        sfxRollStop()
        sfxFirst()
      },
      3: sfxRoll,
      2: sfxSecond,
      1: sfxThird,
    }

    actions[stage]?.()
  }, [stage, sfxFirst, sfxSecond, sfxThird, sfxRoll, sfxRollStop])

  useEffect(() => {
    if (topLength < 3) {
      setStage(4)

      return
    }

    if (stage >= 4) {
      return
    }

    const interval = setInterval(() => {
      setStage((value) => value + 1)
    }, animations.podiumStageInterval)

    // eslint-disable-next-line consistent-return
    return () => clearInterval(interval)
  }, [stage, topLength])

  return { stage, skip }
}

// FINISHED — final podium with confetti + spotlight (source Podium markup).
export const PodiumScreen = () => {
  const { status, role } = useGame()
  const { subject, top } = status.data
  const { t } = useTranslation()

  const { stage, skip } = usePodiumAnimation(top.length)
  const { width, height } = useScreenSize()

  return (
    <>
      {stage >= 4 && <ReactConfetti width={width} height={height} className="h-full w-full" />}

      {stage >= 3 && top.length >= 3 && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}

      {role === 'manager' && stage < 4 && (
        <div className="absolute right-4 top-20 z-50">
          <Button onClick={skip} className="bg-white/20 text-white btn-shadow hover:bg-white/30 px-4">
            {t('Skip Animation')}
          </Button>
        </div>
      )}

      <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-between">
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {subject}
        </h2>

        <div
          style={{ gridTemplateColumns: `repeat(${top.length}, 1fr)` }}
          className="grid w-full max-w-200 flex-1 items-end justify-center justify-self-end overflow-x-visible overflow-y-hidden"
        >
          {top[1] && (
            <PodiumColumn
              rank={2}
              username={top[1].username}
              avatar={resolveAvatar(top[1])}
              points={top[1].points}
              visible={stage >= 2}
              celebrate={stage >= 4}
            />
          )}

          <PodiumColumn
            rank={1}
            username={top[0].username}
            avatar={resolveAvatar(top[0])}
            points={top[0].points}
            visible={stage >= 3}
            celebrate={stage >= 4}
            nameVisible={stage >= 4}
            className={clsx({ 'md:min-w-64': top.length < 2 })}
          />

          {top[2] && (
            <PodiumColumn
              rank={3}
              username={top[2].username}
              avatar={resolveAvatar(top[2])}
              points={top[2].points}
              visible={stage >= 1}
              celebrate={stage >= 4}
            />
          )}
        </div>
      </section>
    </>
  )
}
