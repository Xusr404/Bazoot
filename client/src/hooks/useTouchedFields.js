import { useCallback, useState } from 'react'

export const useTouchedFields = () => {
  const [touched, setTouched] = useState({})

  const touch = useCallback((field) => {
    setTouched((current) => ({ ...current, [field]: true }))
  }, [])

  const touchAll = useCallback((fields) => {
    setTouched((current) => ({
      ...current,
      ...Object.fromEntries(fields.map((field) => [field, true])),
    }))
  }, [])

  const clearTouched = useCallback(() => setTouched({}), [])

  return { touched, touch, touchAll, clearTouched }
}
