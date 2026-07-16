import { QUESTION_TYPES } from '@bazoot/shared/questionTypes'
import { useEffect, useState } from 'react'
import { AnswerGrid } from '../components/game/AnswerGrid.jsx'
import { ResponsesChart } from '../components/game/ResponsesChart.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useMusic, useSfx } from '../hooks/useSound.js'
import { calculatePercentages } from '../utils/percentages.js'

// SHOW_RESPONSES (manager) — vote bar chart + answer row with the correct
// answer(s) highlighted: wrong answers dimmed (single/multi), position badges
// shown for ordering questions. Results sting then the answers music restarts.
export const ResponsesScreen = () => {
  const { status } = useGame()
  const { question, answers, responses, correct } = status.data
  const type = status.data.type ?? QUESTION_TYPES.SINGLE

  const [percentages, setPercentages] = useState({})
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)

  const [sfxResults] = useSfx('results')
  const [playMusic, { stop: stopMusic }] = useMusic('answersMusic', {
    onplay: () => {
      setIsMusicPlaying(true)
    },
    onend: () => {
      setIsMusicPlaying(false)
    },
  })

  useEffect(() => {
    stopMusic()
    sfxResults()

    setPercentages(calculatePercentages(responses))
  }, [responses, playMusic, stopMusic, sfxResults])

  useEffect(() => {
    if (!isMusicPlaying) {
      playMusic()
    }
  }, [isMusicPlaying, playMusic])

  useEffect(() => {
    stopMusic()
  }, [playMusic, stopMusic])

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>

        <ResponsesChart answers={answers} responses={responses} percentages={percentages} />
      </div>

      <div>
        <AnswerGrid
          answers={answers}
          dimmedKeys={
            type === QUESTION_TYPES.ORDER
              ? []
              : answers
                  .map((_, key) => key)
                  .filter((key) =>
                    type === QUESTION_TYPES.MULTI ? !correct.includes(key) : key !== correct,
                  )
          }
          badgeFor={
            type === QUESTION_TYPES.ORDER ? (key) => correct.indexOf(key) + 1 : undefined
          }
        />
      </div>
    </div>
  )
}
