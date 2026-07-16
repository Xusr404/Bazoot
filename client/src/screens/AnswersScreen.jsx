import { EVENTS } from '@bazoot/shared/events'
import { QUESTION_TYPES } from '@bazoot/shared/questionTypes'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { AnswerGrid } from '../components/game/AnswerGrid.jsx'
import { QuestionAudioPlayer } from '../components/game/QuestionAudioPlayer.jsx'
import { StatPill } from '../components/game/StatPill.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useMusic, useSfx } from '../hooks/useSound.js'

const HINTS = {
  [QUESTION_TYPES.MULTI]: 'Select all that apply, then submit',
  [QUESTION_TYPES.ORDER]: 'Tap the answers in the right order, then submit',
}

// SELECT_ANSWER — question + media + Time/Answers pills + answer grid.
// single/trueFalse answer on tap; multi toggles a selection; order builds a
// sequence (numbered badges); both submit explicitly. Music loops while
// answering (suppressed when the question has its own audio/video).
export const AnswersScreen = () => {
  const { role, status, submitAnswer } = useGame()
  const { t } = useTranslation()
  const { question, answers, image, audio, video, time, totalPlayer } = status.data
  const type = status.data.type ?? QUESTION_TYPES.SINGLE
  const isInteractive = role === 'player'
  const needsSubmit = type === QUESTION_TYPES.MULTI || type === QUESTION_TYPES.ORDER
  const showMediaPlayer = role === 'manager'

  const [cooldown, setCooldown] = useState(time)
  const [totalAnswer, setTotalAnswer] = useState(0)
  const [selection, setSelection] = useState([])
  const [submitted, setSubmitted] = useState(false)

  const [sfxPop] = useSfx('answersSound')
  const [playMusic, { stop: stopMusic }] = useMusic('answersMusic', {
    interrupt: true,
    loop: true,
  })

  const canSubmit =
    !submitted &&
    (type === QUESTION_TYPES.MULTI
      ? selection.length > 0
      : selection.length === answers.length)

  const handleAnswer = (answerKey) => {
    if (!isInteractive || submitted) {
      return
    }

    if (type === QUESTION_TYPES.MULTI) {
      setSelection(
        selection.includes(answerKey)
          ? selection.filter((key) => key !== answerKey)
          : [...selection, answerKey],
      )
      if (navigator.vibrate) navigator.vibrate([50])
      sfxPop()

      return
    }

    if (type === QUESTION_TYPES.ORDER) {
      setSelection(
        selection.includes(answerKey)
          ? selection.filter((key) => key !== answerKey)
          : [...selection, answerKey],
      )
      if (navigator.vibrate) navigator.vibrate([50])
      sfxPop()

      return
    }

    submitAnswer(answerKey)
    if (navigator.vibrate) navigator.vibrate([50])
    sfxPop()
  }

  const handleSubmit = () => {
    if (!isInteractive || !canSubmit) {
      return
    }

    setSubmitted(true)
    submitAnswer(selection)
    if (navigator.vibrate) navigator.vibrate([50])
    sfxPop()
  }

  useEffect(() => {
    if (video || audio) {
      return
    }

    playMusic()

    // eslint-disable-next-line consistent-return
    return () => {
      stopMusic()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMusic])

  useSocketEvent(EVENTS.GAME_COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  useSocketEvent(EVENTS.GAME_PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    sfxPop()
  })

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
          {question}
        </h2>

        {Boolean(audio) && showMediaPlayer && (
          <QuestionAudioPlayer src={audio} autoPlay />
        )}

        {Boolean(video) && showMediaPlayer && (
          <video
            className="m-4 mb-2 aspect-video max-h-60 w-auto rounded-md px-4 sm:max-h-100"
            src={video}
            autoPlay
            controls
          />
        )}

        {Boolean(image) && (
          <img
            alt={question}
            src={image}
            className="mb-2 max-h-60 w-auto rounded-md px-4 sm:max-h-100"
          />
        )}
      </div>

      <div>
        <div className="mx-auto mb-4 flex w-full max-w-7xl justify-between gap-1 px-2 text-lg font-bold text-white md:text-xl">
          <StatPill label={t('Time')}>{cooldown}</StatPill>
          <StatPill label={t('Answers')}>
            {totalAnswer}/{totalPlayer}
          </StatPill>
        </div>

        {needsSubmit && isInteractive && (
          <div className="mx-auto mb-2 flex w-full max-w-7xl flex-col items-center gap-2 px-2">
            <p className="text-sm font-bold text-white/80 drop-shadow-md">{t(HINTS[type])}</p>
            <Button
              onClick={handleSubmit}
              className={clsx('px-8', { 'pointer-events-none opacity-50': !canSubmit })}
            >
              {t('Submit')}
            </Button>
          </div>
        )}

        <AnswerGrid
          answers={answers}
          onAnswer={handleAnswer}
          selectedKeys={needsSubmit ? selection : []}
          badgeFor={
            type === QUESTION_TYPES.ORDER
              ? (key) => {
                  const position = selection.indexOf(key)

                  return position === -1 ? null : position + 1
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
