import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import QRCode from 'react-qr-code'
import { useTranslation } from '../../i18n/index.js'
import { copyText } from '../../utils/clipboard.js'

// Manager lobby header: join URL + game PIN (clip-path arrow joint) + QR code.
// Markup identical to the source RoomView, plus two interactions:
// - clicking the PIN card copies the join link to the clipboard
// - clicking the QR code enlarges it in a centered fullscreen overlay
export const PinPanel = ({ webUrl, inviteCode }) => {
  const { t } = useTranslation()
  const joinUrl = `${webUrl}?pin=${inviteCode}`
  const [isQrEnlarged, setIsQrEnlarged] = useState(false)

  const handleCopy = async () => {
    const copied = await copyText(joinUrl)

    if (copied) {
      toast.success(t('Join link copied'))
    } else {
      toast.error(t('Could not copy the link'))
    }
  }

  // Close the enlarged QR with Escape as well as by clicking.
  useEffect(() => {
    if (!isQrEnlarged) {
      return
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsQrEnlarged(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // eslint-disable-next-line consistent-return
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isQrEnlarged])

  return (
    <>
      <div className="mb-10 flex flex-col-reverse items-center gap-3 md:flex-row md:items-stretch">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="game-pin-out flex flex-col justify-center rounded-md bg-white px-6 py-4">
            <p className="text-2xl font-bold">{t('Join the game at')}</p>
            <p className="w-60 text-lg font-extrabold break-all">{webUrl}</p>
          </div>

          <div
            className="game-pin-in flex cursor-pointer flex-col justify-center rounded-md bg-white px-6 py-4 text-center md:rounded-l-none md:text-left"
            onClick={handleCopy}
            title={t('Click to copy the join link')}
            role="button"
          >
            <p className="text-2xl font-bold">{t('Game PIN:')}</p>
            <p className="text-6xl font-extrabold">{inviteCode}</p>
          </div>
        </div>

        <div
          className="flex h-40 shrink-0 cursor-pointer rounded-md bg-white p-2"
          onClick={() => setIsQrEnlarged(true)}
          title={t('Click to enlarge')}
          role="button"
        >
          <QRCode className="h-auto w-auto" value={joinUrl} />
        </div>
      </div>

      {isQrEnlarged && (
        <div
          className="fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center gap-6 bg-black/70"
          onClick={() => setIsQrEnlarged(false)}
          role="button"
          title={t('Click to close')}
        >
          <div className="anim-show rounded-md bg-white p-6">
            <QRCode className="h-[65vmin] w-[65vmin]" value={joinUrl} />
          </div>
          <p className="text-3xl font-bold text-white drop-shadow-lg">
            {webUrl} — PIN: {inviteCode}
          </p>
        </div>
      )}
    </>
  )
}
