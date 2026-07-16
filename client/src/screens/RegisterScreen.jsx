import { EVENTS } from '@bazoot/shared/events'
import {
  validateEmail,
  validateManagerPassword,
  validateManagerUsername,
} from '@bazoot/shared/validation'
import clsx from 'clsx'
import { useState } from 'react'
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

const Hint = ({ state, children }) => (
  <span
    className={clsx('text-xs font-semibold', {
      'text-gray-400': state === 'idle',
      'text-green-600': state === 'ok',
      'text-red-500': state === 'bad',
    })}
  >
    {state === 'ok' && '✓ '}
    {children}
  </span>
)

// Public self-registration (shown only when the server allows it). Mirrors the
// first-run setup screen, but email is required: a self-registered account may
// need to verify it, and it enables password recovery later. On success the
// server returns the login state and ManagerPage switches back here.
export const RegisterScreen = ({ onBack }) => {
  const { registerManager } = useGame()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { touched, touch, touchAll } = useTouchedFields()

  // Success arrives as an auth-state change; errors as a toast — both end pending.
  useSocketEvent(EVENTS.MANAGER_AUTH_STATE, () => setPending(false))
  const handleError = (message) => {
    setPending(false)
    setErrorMessage(message)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const usernameOk = validateManagerUsername(username).ok
  const emailOk = validateEmail(email).ok
  const passwordOk = validateManagerPassword(password).ok
  const confirmState = confirm === '' ? 'idle' : confirm === password ? 'ok' : 'bad'
  const organizationOk = organizationName.trim().length >= 2
  const formValid = usernameOk && emailOk && passwordOk && confirm === password && organizationOk

  const handleSubmit = () => {
    touchAll(['organization', 'username', 'email', 'password', 'confirm'])

    if (!formValid || pending) {
      return
    }

    setPending(true)
    setErrorMessage('')
    registerManager(username, password, email, organizationName.trim())
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <ManagerAuthCard>
      <ManagerAuthHeader
        eyebrow="Manager account"
        title="Create an account"
        description="Register a manager account to build and host quizzes."
      />
      <ManagerAuthBody>

      <div className="flex flex-col gap-1">
        <Input
          aria-label={t('Organization name')}
          invalid={
            (touched.organization && !organizationOk) ||
            hasFieldError(errorMessage, 'organization')
          }
          valid={touched.organization && organizationOk}
          value={organizationName}
          onChange={(e) => {
            setOrganizationName(e.target.value)
            setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('organization')}
          placeholder={t('Organization name')}
          autoComplete="organization"
        />
        <Hint state={organizationName === '' ? 'idle' : organizationOk ? 'ok' : 'bad'}>
          {t('You will be the owner of this workspace')}
        </Hint>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          aria-label={t('Username')}
          invalid={
            (touched.username && !usernameOk) || hasFieldError(errorMessage, 'username')
          }
          valid={touched.username && usernameOk}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('username')}
          placeholder={t('Username')}
          autoComplete="username"
        />
        <Hint state={username === '' ? 'idle' : usernameOk ? 'ok' : 'bad'}>
          {t('3–20 characters: letters, numbers, - and _')}
        </Hint>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          aria-label={t('Email')}
          invalid={(touched.email && !emailOk) || hasFieldError(errorMessage, 'email')}
          valid={touched.email && emailOk}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('email')}
          placeholder={t('Email')}
          autoComplete="email"
        />
        <Hint state={email === '' ? 'idle' : emailOk ? 'ok' : 'bad'}>
          {t('Used for verification and password recovery')}
        </Hint>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          aria-label={t('Password')}
          invalid={
            (touched.password && !passwordOk) || hasFieldError(errorMessage, 'password')
          }
          valid={touched.password && passwordOk}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('password')}
          placeholder={t('Password')}
          autoComplete="new-password"
        />
        <Hint state={password === '' ? 'idle' : passwordOk ? 'ok' : 'bad'}>
          {t('At least 8 characters')}
        </Hint>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          aria-label={t('Confirm password')}
          type="password"
          invalid={touched.confirm && confirm !== password}
          valid={touched.confirm && confirm !== '' && confirm === password}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('confirm')}
          placeholder={t('Confirm password')}
          autoComplete="new-password"
        />
        <Hint state={confirmState}>
          {confirmState === 'bad' ? t('Passwords do not match') : t('Both passwords must match')}
        </Hint>
      </div>

      <Button onClick={handleSubmit} disabled={!formValid || pending}>
        {pending ? t('Creating account…') : t('Create account')}
      </Button>

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
