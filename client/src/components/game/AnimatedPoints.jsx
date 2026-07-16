import { useSpring, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import { animations } from '../../tokens/index.js'

// Leaderboard points count-up. Same spring as source (stiffness 1000, damping 30).
export const AnimatedPoints = ({ from, to }) => {
  const spring = useSpring(from, animations.leaderboard.pointsSpring)
  const display = useTransform(spring, (value) => Math.round(value))
  const [displayValue, setDisplayValue] = useState(from)

  useEffect(() => {
    spring.set(to)
    const unsubscribe = display.on('change', (latest) => {
      setDisplayValue(latest)
    })

    return unsubscribe
  }, [to, spring, display])

  return <span className="drop-shadow-md">{displayValue}</span>
}
