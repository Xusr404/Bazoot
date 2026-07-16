import { createContext, useCallback, useContext, useState } from 'react'

const SoundContext = createContext(null)

export const SoundProvider = ({ children }) => {
  const [isMuted, setIsMutedState] = useState(() => {
    return localStorage.getItem('bazoot_muted') === 'true'
  })

  const setIsMuted = useCallback((value) => {
    setIsMutedState(value)
    localStorage.setItem('bazoot_muted', String(value))
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted)
  }, [isMuted, setIsMuted])

  return (
    <SoundContext.Provider value={{ isMuted, setIsMuted, toggleMute }}>
      {children}
    </SoundContext.Provider>
  )
}

export const useSoundContext = () => {
  const context = useContext(SoundContext)
  if (!context) {
    throw new Error('useSoundContext must be used inside a SoundProvider')
  }
  return context
}
