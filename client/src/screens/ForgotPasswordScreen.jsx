import { EVENTS } from '@bazoot/shared/events'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  ManagerAuthBody,
  ManagerAuthCard,
  ManagerAuthHeader,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'

// Step 1 of password recovery: ask for a username or email and request a reset
// link. The server replies the same way whether or not the account exists, so
// the confirmation never reveals which addresses are registered.
export const ForgotPasswordScreen = ({ onBack }) => {
  const { requestPasswordReset } = useGame()
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { touched, touch } = useTouchedFields()

  useSocketEvent(EVENTS.MANAGER_PASSWORD_RESET_SENT, () => {
    setPending(false)
    setSent(true)
  })
  const handleError = (message) => {
    setPending(false)
    setErrorMessage(message)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const handleSubmit = () => {
    touch('identifier')

    if (pending) {
      return
    }

    if (!identifier.trim()) {
      const message = 'Enter your username or email'
      setErrorMessage(message)
      toast.error(t(message))

      return
    }

    setPending(true)
    setErrorMessage('')
    requestPasswordReset(identifier.trim())
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <ManagerAuthCard>
      <ManagerAuthHeader
        eyebrow="Account recovery"
        title="Reset password"
        description="We'll email you a link to choose a new password."
      />
      <ManagerAuthBody>

      {sent ? (
        <div className="rounded-md bg-green-100 p-3 text-sm font-semibold text-green-800 outline outline-green-300">
          {t("If that account exists, a reset link is on its way. It's valid for 1 hour — check your inbox (and spam folder).")}
        </div>
      ) : (
        <>
          <Input
            aria-label={t('Username or email')}
            invalid={
              (touched.identifier && !identifier.trim()) ||
              hasFieldError(errorMessage, 'identifier')
            }
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              setErrorMessage('')
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => touch('identifier')}
            placeholder={t('Username or email')}
            autoComplete="username"
          />
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? t('Sending…') : t('Send reset link')}
          </Button>
        </>
      )}

      <button
        className="text-sm font-bold text-gray-500 hover:text-gray-800 hover:underline"
        onClick={onBack}
      >
        {t('Back to login')}
      </button>
      </ManagerAuthBody>
    </ManagerAuthCard>
  )
}
