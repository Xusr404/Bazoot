import useSoundLib from 'use-sound'
import { useSoundContext } from '../context/SoundContext.jsx'
import { SOUNDS, SOUND_VOLUMES } from '../tokens/index.js'

// Sound layer (Phase 7F), built on the same library as the source (use-sound).
// Volumes come from tokens; trigger points are identical to the source app.

/** One-shot effect: `const [play] = useSfx('boump')`. */
export const useSfx = (name, options = {}) => {
  const { isMuted } = useSoundContext()
  return useSoundLib(SOUNDS[name], { volume: SOUND_VOLUMES[name], soundEnabled: !isMuted, ...options })
}

/** Looping/controlled track: `const [play, { stop }] = useMusic('answersMusic', { loop: true })`. */
export const useMusic = (name, options = {}) => {
  const { isMuted } = useSoundContext()
  return useSoundLib(SOUNDS[name], { volume: SOUND_VOLUMES[name], soundEnabled: !isMuted, ...options })
}
