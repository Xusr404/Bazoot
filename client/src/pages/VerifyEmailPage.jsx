import { EVENTS } from '@bazoot/shared/events'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import { Loader } from '../components/ui/Loader.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTranslation } from '../i18n/index.js'

// Landing page for the link in the verification email: /manager/verify?token=…
export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams()
  const { isConnected, connect, verifyEmail } = useGame()
  const { t } = useTranslation()
  const [result, setResult] = useState({ state: 'pending' }) // pending | success | error
  const submittedRef = useRef(false)
  const token = searchParams.get('token')

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useEffect(() => {
    if (!token) {
      setResult({ state: 'error', message: 'This verification link is incomplete' })

      return
    }

    if (isConnected && !submittedRef.current) {
      submittedRef.current = true
      verifyEmail(token)
    }
  }, [isConnected, token, verifyEmail])

  useSocketEvent(EVENTS.MANAGER_EMAIL_VERIFIED, ({ username, alreadyVerified }) => {
    setResult({ state: 'success', username, alreadyVerified })
  })

  // Only errors while we are still waiting belong to this verification —
  // never overwrite a success with an unrelated socket error.
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (message) => {
    setResult((current) => (current.state === 'pending' ? { state: 'error', message } : current))
  })

  return (
    <AuthShell isConnected={isConnected}>
      <div className="z-10 flex w-full max-w-80 flex-col items-center gap-4 rounded-md bg-white p-6 text-center shadow-sm">
        {result.state === 'pending' && (
          <>
            <Loader className="h-16" />
            <p className="font-bold">{t('Verifying your email…')}</p>
          </>
        )}

        {result.state === 'success' && (
          <>
            <p className="text-4xl">✅</p>
            <h1 className="text-xl font-bold">
              {result.alreadyVerified ? t('Already verified') : t('Email verified!')}
            </h1>
            <p className="text-sm font-semibold text-gray-500">
              {result.alreadyVerified ? (
                <>
                  {t('The account {username} was verified earlier — you can simply log in.', {
                    username: result.username,
                  })}
                </>
              ) : (
                <>
                  {t('The account {username} is now active. Log in with your username and password to get started.', {
                    username: result.username,
                  })}
                </>
              )}
            </p>
            <Link
              className="btn-shadow bg-primary w-full rounded-md p-2 text-lg font-semibold text-white"
              to="/manager"
            >
              <span>{t('Go to login')}</span>
            </Link>
          </>
        )}

        {result.state === 'error' && (
          <>
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-bold">{t('Verification failed')}</h1>
            <p className="text-sm font-semibold text-gray-500">{t(result.message)}</p>
            <p className="text-xs font-semibold text-gray-400">
              {t('You can request a fresh link from the login page ("Resend verification email").')}
            </p>
            <Link
              className="btn-shadow bg-primary w-full rounded-md p-2 text-lg font-semibold text-white"
              to="/manager"
            >
              <span>{t('Back to login')}</span>
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  )
}
