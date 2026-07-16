import clsx from 'clsx'
import background from '../../assets/background.webp'
import { useTranslation } from '../../i18n/index.js'
import { Button } from '../ui/Button.jsx'
import { Loader } from '../ui/Loader.jsx'
import { useSoundContext } from '../../context/SoundContext.jsx'

// Chrome around every in-game screen, markup identical to the source GameFrame:
// fullscreen background image, question-progress chip, manager next button,
// player bottom bar, "Connecting..." fallback. `fullScreen=false` fills the
// parent instead of the viewport (demo run renders it under a banner bar).
export const GameFrame = ({
  children,
  isConnected,
  statusName,
  questionProgress,
  manager,
  next,
  isNextDisabled,
  onNext,
  toolbar,
  playerUsername,
  playerAvatar,
  playerPoints,
  fullScreen = true,
}) => {
  const { t } = useTranslation()
  const { isMuted, toggleMute } = useSoundContext()

  return (
    <section className={clsx('relative flex', fullScreen ? 'min-h-dvh' : 'h-full overflow-y-auto')}>
      <div className="fixed top-0 left-0 h-full w-full">
        <img
          className="pointer-events-none h-full w-full object-cover"
          src={background}
          alt="background"
        />
      </div>

      <div className="z-10 flex flex-1 w-full flex-col justify-between">
        {!isConnected && !statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-4xl font-bold text-white">{t('Connecting...')}</h1>
          </div>
        ) : (
          <>
            <div className="flex w-full items-start justify-between gap-3 p-4">
              {questionProgress && (
                <div className="shadow-inset flex items-center rounded-md bg-white p-2 px-4 text-lg font-bold text-black">
                  {`${questionProgress.current} / ${questionProgress.total}`}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button
                  className="bg-white/20 text-white px-3 py-2 btn-shadow shadow-inset hover:bg-white/30"
                  onClick={toggleMute}
                  title={isMuted ? t('Unmute sounds') : t('Mute sounds')}
                >
                  {isMuted ? '🔇' : '🔊'}
                </Button>

                {manager && (
                  <>
                    {toolbar}
                    {next && (
                      <Button
                        className={clsx('self-end bg-white px-4 text-black!', {
                          'pointer-events-none': isNextDisabled,
                        })}
                        onClick={onNext}
                      >
                        {next}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {children}

            {!manager && (
              <div className="z-50 flex items-center justify-between bg-white px-4 py-2 text-lg font-bold text-white">
                <p className="flex items-center gap-2 text-gray-800">
                  {playerAvatar && (
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {playerAvatar}
                    </span>
                  )}
                  {playerUsername}
                </p>
                <div className="rounded-sm bg-gray-800 px-3 py-1 text-lg">{playerPoints}</div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
