// Copy text to the clipboard. navigator.clipboard only exists in secure
// contexts (https / localhost) — players on a LAN address (http://192.168.…)
// fall back to the legacy execCommand path.
export const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)

      return true
    } catch {
      // fall through to the legacy path
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false

  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  textarea.remove()

  return copied
}
