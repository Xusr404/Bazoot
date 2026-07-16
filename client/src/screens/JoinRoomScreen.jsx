import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button.jsx'
import { FormCard } from '../components/ui/FormCard.jsx'
import { Input } from '../components/ui/Input.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'

// PIN entry form. Supports ?pin= auto-join from the lobby QR code
// (source join/Room).
export const JoinRoomScreen = ({ errorMessage, onChange }) => {
  const { isConnected, joinRoom } = useGame()
  const { t } = useTranslation()
  const [invitation, setInvitation] = useState('')
  const [searchParams] = useSearchParams()
  const hasJoinedRef = useRef(false)

  const handleJoin = () => {
    joinRoom(invitation)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleJoin()
    }
  }

  useEffect(() => {
    const pinCode = searchParams.get('pin')

    if (!isConnected || !pinCode || hasJoinedRef.current) {
      return
    }

    joinRoom(pinCode)
    hasJoinedRef.current = true
  }, [searchParams, isConnected, joinRoom])

  return (
    <FormCard>
      <Input
        invalid={hasFieldError(errorMessage, 'invitation')}
        onChange={(e) => {
          setInvitation(e.target.value)
          onChange?.()
        }}
        onKeyDown={handleKeyDown}
        placeholder={t('PIN Code here')}
      />
      <Button onClick={handleJoin}>{t('Submit')}</Button>
    </FormCard>
  )
}
