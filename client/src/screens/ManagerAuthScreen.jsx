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
import { useTranslation } from '../i18n/index.js'
import { useCooldown } from '../hooks/useCooldown.js'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'
import { hasFieldError } from '../utils/formErrors.js'

// Manager login. When the entered credentials are correct but the account's
// email is unverified, the page passes `unverifiedUsername` and an amber panel
// explains the situation with a one-click resend (60 s cooldown).
export const ManagerAuthScreen = ({
  unverifiedUsername,
  allowRegistration,
  onRegister,
  onForgot,
}) => {
  const { authenticateManager, resendVerification } = useGame()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { touched, touch, touchAll } = useTouchedFields()
  const { remaining, start } = useCooldown()

  // Any auth response (success, state change, or error) ends the pending state.
  useSocketEvent(EVENTS.MANAGER_AUTH_SUCCESS, () => setPending(false))
  useSocketEvent(EVENTS.MANAGER_AUTH_STATE, () => setPending(false))
  const handleError = (message) => {
    setPending(false)
    setErrorMessage(message)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const handleSubmit = () => {
    touchAll(['username', 'password'])

    if (pending) {
      return
    }

    if (!username || !password) {
      const message = t('Please enter your username and password')
      setErrorMessage(message)
      toast.error(message)

      return
    }

    setPending(true)
    setErrorMessage('')
    authenticateManager(username, password)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  const handleResend = (identifier) => {
    if (remaining > 0) {
      return
    }

    if (!identifier) {
      toast.error(t('Enter your username (or email) first'))

      return
    }

    resendVerification(identifier)
    start(60)
  }

  return (
    <ManagerAuthCard>
      <ManagerAuthHeader
        eyebrow={t('Manager access')}
        title={t('Log in')}
        description={t('Sign in to manage workspaces, quizzes, members, and live games.')}
      />
      <ManagerAuthBody>
      {unverifiedUsername && (
        <div className="flex flex-col gap-2 rounded-md bg-amber-100 p-3 text-sm font-semibold text-amber-800 outline outline-amber-300">
          <p>
            <span className="font-bold">{unverifiedUsername}</span>{' '}
            {t('is not verified yet. Open the link in your verification email, then log in.')}
          </p>
          <Button
            className="p-1 text-sm"
            onClick={() => handleResend(unverifiedUsername)}
            disabled={remaining > 0}
          >
            {remaining > 0
              ? t('Email sent — wait {seconds}s', { seconds: remaining })
              : t('Resend verification email')}
          </Button>
        </div>
      )}

      <Input
        aria-label={t('Username')}
        invalid={(touched.username && !username) || hasFieldError(errorMessage, 'username')}
        onChange={(e) => {
          setUsername(e.target.value)
          setErrorMessage('')
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => touch('username')}
        placeholder={t('Username')}
        autoComplete="username"
      />
      <Input
        aria-label={t('Password')}
        invalid={(touched.password && !password) || hasFieldError(errorMessage, 'password')}
        type="password"
        onChange={(e) => {
          setPassword(e.target.value)
          setErrorMessage('')
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => touch('password')}
        placeholder={t('Password')}
        autoComplete="current-password"
      />
      <Button onClick={handleSubmit} disabled={pending}>
        {pending ? t('Logging in…') : t('Log in')}
      </Button>

      {!unverifiedUsername && (
        <button
          className="text-sm font-bold text-gray-500 hover:text-gray-800 hover:underline disabled:opacity-50"
          onClick={() => handleResend(username)}
          disabled={remaining > 0}
        >
          {remaining > 0
            ? t('Verification email sent ({seconds}s)', { seconds: remaining })
            : t('Resend verification email')}
        </button>
      )}

      <div className="flex flex-col gap-1 border-t border-gray-200 pt-2 text-center">
        <button
          className="text-sm font-bold text-gray-500 hover:text-gray-800 hover:underline"
          onClick={onForgot}
        >
          {t('Forgot your password?')}
        </button>
        {allowRegistration && (
          <button
            className="text-sm font-bold text-gray-500 hover:text-gray-800 hover:underline"
            onClick={onRegister}
          >
            {t('Create an account')}
          </button>
        )}
      </div>
      </ManagerAuthBody>
    </ManagerAuthCard>
  )
}
