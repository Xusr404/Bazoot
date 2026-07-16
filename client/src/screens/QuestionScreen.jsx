import { useEffect } from 'react'
import { useGame } from '../context/GameContext.jsx'
import { useSfx } from '../hooks/useSound.js'

// SHOW_QUESTION — question text (pop-in) + optional image + reading-time
// progress bar (width 0→100% over `cooldown` seconds), source Question markup.
export const QuestionScreen = () => {
  const { status } = useGame()
  const { question, image, cooldown } = status.data
  const [sfxShow] = useSfx('show')
  const questionLength = question?.trim().length ?? 0
  const hasMedia = Boolean(image)
  const questionSize = hasMedia
    ? 'text-3xl md:text-4xl lg:text-5xl'
    : questionLength <= 24
      ? 'text-6xl md:text-7xl lg:text-8xl'
      : questionLength <= 80
        ? 'text-5xl md:text-6xl lg:text-7xl'
        : 'text-3xl md:text-4xl lg:text-5xl'

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <h2 className={`anim-show max-w-6xl text-center font-bold text-white drop-shadow-lg ${questionSize}`}>
          {question}
        </h2>

        {Boolean(image) && (
          <img alt={question} src={image} className="max-h-60 w-auto rounded-md sm:max-h-100" />
        )}
      </div>
      <div
        className="bg-primary mb-20 h-4 self-start justify-self-end rounded-full"
        style={{ animation: `progressBar ${cooldown}s linear forwards` }}
      ></div>
    </section>
  )
}
