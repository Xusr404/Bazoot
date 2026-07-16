import { useEffect, useState } from 'react'

// Client-side cooldown counter mirroring server rate limits (e.g. the 60 s
// verification-resend cooldown). `start(seconds)` arms it; `remaining` counts
// down to 0 once per second.
export const useCooldown = () => {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (Date.now() >= until) {
      return undefined
    }

    const interval = setInterval(() => {
      setNow(Date.now())

      if (Date.now() >= until) {
        clearInterval(interval)
      }
    }, 250)

    return () => clearInterval(interval)
  }, [until])

  return {
    remaining: Math.max(0, Math.ceil((until - now) / 1000)),
    start: (seconds) => {
      setNow(Date.now())
      setUntil(Date.now() + seconds * 1000)
    },
  }
}
