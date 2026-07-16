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

// First-run bootstrap with live inline validation: shown when no manager
// account exists yet. This account is active immediately (no verification).
export const ManagerSetupScreen = () => {
  const { setupManager } = useGame()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { touched, touch, touchAll } = useTouchedFields()

  useSocketEvent(EVENTS.MANAGER_AUTH_SUCCESS, () => setPending(false))
  const handleError = (message) => {
    setPending(false)
    setErrorMessage(message)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const usernameOk = validateManagerUsername(username).ok
  const passwordOk = validateManagerPassword(password).ok
  const emailOk = email === '' || validateEmail(email).ok
  const confirmState = confirm === '' ? 'idle' : confirm === password ? 'ok' : 'bad'
  const formValid = usernameOk && passwordOk && emailOk && confirm === password

  const handleSubmit = () => {
    touchAll(['username', 'email', 'password', 'confirm'])

    if (!formValid || pending) {
      return
    }

    setPending(true)
    setErrorMessage('')
    setupManager(username, password, email || undefined)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <ManagerAuthCard>
      <ManagerAuthHeader
        eyebrow="Manager setup"
        title="Welcome!"
        description="Create the first manager account to get started."
      />
      <ManagerAuthBody>

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
          valid={touched.email && email !== '' && emailOk}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => touch('email')}
          placeholder={t('Email (optional)')}
          autoComplete="email"
        />
        <Hint state={email === '' ? 'idle' : emailOk ? 'ok' : 'bad'}>
          {t('Optional — this first account needs no verification')}
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
      </ManagerAuthBody>
    </ManagerAuthCard>
  )
}
