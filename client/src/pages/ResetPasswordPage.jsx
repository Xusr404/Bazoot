import { EVENTS } from '@bazoot/shared/events'
import { validateManagerPassword } from '@bazoot/shared/validation'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
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

// Landing page for the link in the reset email: /manager/reset-password?token=…
// Unlike the verify page it does not auto-submit — the user picks a new password.
export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams()
  const { isConnected, connect, resetPassword } = useGame()
  const { t } = useTranslation()
  const token = searchParams.get('token')

  const [result, setResult] = useState(
    token ? { state: 'form' } : { state: 'error', message: 'This reset link is incomplete' },
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState('')
  const { touched, touch, touchAll } = useTouchedFields()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  const passwordOk = validateManagerPassword(password).ok
  const confirmState = confirm === '' ? 'idle' : confirm === password ? 'ok' : 'bad'
  const formValid = passwordOk && confirm === password

  const handleSubmit = () => {
    touchAll(['password', 'confirm'])

    if (!formValid || pending) {
      return
    }

    setPending(true)
    setFormError('')
    resetPassword(token, password)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  useSocketEvent(EVENTS.MANAGER_PASSWORD_RESET_SUCCESS, ({ username }) => {
    setPending(false)
    setResult({ state: 'success', username })
  })

  // Only adopt an error while the form is still showing (e.g. expired/used
  // token) — never overwrite a success with an unrelated socket error.
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (message) => {
    setPending(false)

    if (result.state === 'form' && hasFieldError(message, 'password')) {
      setFormError(message)

      return
    }

    setResult((current) => (current.state === 'form' ? { state: 'error', message } : current))
  })

  return (
    <AuthShell isConnected={isConnected}>
      <div className="z-10 flex w-full max-w-80 flex-col gap-3 rounded-md bg-white p-6 shadow-sm">
        {result.state === 'form' && (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t('Choose a new password')}</h1>
              <p className="text-sm font-semibold text-gray-500">
                {t('Enter a new password for your account')}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Input
                aria-label={t('New password')}
                invalid={
                  (touched.password && !passwordOk) || hasFieldError(formError, 'password')
                }
                valid={touched.password && passwordOk}
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFormError('')
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('New password')}
                autoComplete="new-password"
                onBlur={() => touch('password')}
              />
              <Hint state={password === '' ? 'idle' : passwordOk ? 'ok' : 'bad'}>
                {t('At least 8 characters')}
              </Hint>
            </div>

            <div className="flex flex-col gap-1">
              <Input
                aria-label={t('Confirm new password')}
                type="password"
                invalid={touched.confirm && confirm !== password}
                valid={touched.confirm && confirm !== '' && confirm === password}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('Confirm new password')}
                autoComplete="new-password"
                onBlur={() => touch('confirm')}
              />
              <Hint state={confirmState}>
                {confirmState === 'bad' ? t('Passwords do not match') : t('Both passwords must match')}
              </Hint>
            </div>

            <Button onClick={handleSubmit} disabled={!formValid || pending}>
              {pending ? t('Saving…') : t('Reset password')}
            </Button>
          </>
        )}

        {result.state === 'success' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-4xl">✅</p>
            <h1 className="text-xl font-bold">{t('Password updated')}</h1>
            <p className="text-sm font-semibold text-gray-500">
              {t('The password for {username} has been changed. Log in with your new password to continue.', {
                username: result.username,
              })}
            </p>
            <Link
              className="btn-shadow bg-primary w-full rounded-md p-2 text-lg font-semibold text-white"
              to="/manager"
            >
              <span>{t('Go to login')}</span>
            </Link>
          </div>
        )}

        {result.state === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-bold">{t('Reset failed')}</h1>
            <p className="text-sm font-semibold text-gray-500">{t(result.message)}</p>
            <p className="text-xs font-semibold text-gray-400">
              {t('Request a fresh link from the login page ("Forgot your password?").')}
            </p>
            <Link
              className="btn-shadow bg-primary w-full rounded-md p-2 text-lg font-semibold text-white"
              to="/manager"
            >
              <span>{t('Back to login')}</span>
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  )
}
