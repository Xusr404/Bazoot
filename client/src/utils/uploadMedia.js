import { getManagerOrganization, getManagerToken } from './managerSession.js'

const managerHeaders = () => ({
  Authorization: `Bearer ${getManagerToken() ?? ''}`,
  ...(getManagerOrganization() ? { 'X-Organization-Id': getManagerOrganization() } : {}),
})

// Keep in step with the server's UPLOAD_MAX_BYTES default so oversized files are
// rejected before the upload round-trip rather than after.
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024

// Upload one question-media file to the game server and return its stored
// /uploads/<name> path (kept same-origin via the Vite proxy in dev). The file is
// sent as a raw body; the server derives the extension from the content-type.
export const uploadMedia = async (file) => {
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`File is larger than ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB`)
  }

  const response = await fetch('/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...managerHeaders(),
    },
    body: file,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Upload failed (${response.status})`)
  }

  const { url } = await response.json()

  return url
}

// The media picker uses this small, authenticated library to let managers reuse
// files already stored for their team instead of uploading duplicates.
export const listMedia = async () => {
  const response = await fetch('/uploads', {
    headers: managerHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Could not load media (${response.status})`)
  }

  const { items } = await response.json()

  return items
}
