import { useEffect, useRef, useState } from 'react'
import { PlayIcon, ReplayIcon, StopIcon } from '../icons/ui.jsx'

// Question clips are deliberately short. A single game-style control avoids
// the visual weight and needless precision of a full browser audio player.
export const QuestionAudioPlayer = ({ src, autoPlay = false }) => {
  const audioRef = useRef(null)
  const [state, setState] = useState('idle')

  useEffect(() => {
    setState('idle')
  }, [autoPlay, src])

  const controlAudio = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (state === 'playing') {
      audio.pause()
      audio.currentTime = 0
      setState('idle')

      return
    }

    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      setState('idle')
    }
  }

  const isReplay = state === 'ended'
  const label = state === 'playing' ? 'Stop audio' : isReplay ? 'Replay audio' : 'Play audio'

  return (
    <div className="flex items-center justify-center">
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        onPlay={() => setState('playing')}
        onEnded={() => setState('ended')}
      />
      <button
        type="button"
        onClick={controlAudio}
        title={label}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-[0_4px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:translate-y-0.5 active:shadow-none motion-reduce:transition-none"
      >
        {state === 'playing' ? (
          <StopIcon className="h-5 w-5" />
        ) : isReplay ? (
          <ReplayIcon className="h-6 w-6" />
        ) : (
          <PlayIcon className="ml-0.5 h-6 w-6" />
        )}
      </button>
    </div>
  )
}
