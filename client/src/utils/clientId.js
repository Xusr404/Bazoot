import { v7 as uuid } from 'uuid'

const STORAGE_KEY = 'client_id'

// Stable per-browser identity for reconnects (sockets are ephemeral, this is not).
// Same mechanism and storage key as the source app.
export const getClientId = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)

    if (stored) {
      return stored
    }

    const newId = uuid()
    localStorage.setItem(STORAGE_KEY, newId)

    return newId
  } catch {
    return uuid()
  }
}
