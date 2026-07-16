import { Loader } from '../components/ui/Loader.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'

// WAIT — loader + status text (source Wait). The text is server-authored, so it
// is translated at the render boundary via t().
export const WaitScreen = () => {
  const { status } = useGame()
  const { t } = useTranslation()
  const { text } = status.data

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <Loader className="h-30" />
      <h2 className="mt-5 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl">
        {t(text)}
      </h2>
    </section>
  )
}
