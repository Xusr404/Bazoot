import { EVENTS } from '@bazoot/shared/events'
import { validateManagerPassword, validateManagerUsername } from '@bazoot/shared/validation'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Loader } from '../components/ui/Loader.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'

export const AcceptInvitationPage = () => {
  const [searchParams] = useSearchParams()
  const { isConnected, connect, inspectInvitation, acceptInvitation } = useGame()
  const { t } = useTranslation()
  const token = searchParams.get('token')
  const [state, setState] = useState(token ? 'loading' : 'error')
  const [details, setDetails] = useState(null)
  const [message, setMessage] = useState(token ? '' : 'This invitation link is incomplete')
  const [formError, setFormError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const inspectedRef = useRef(false)
  const acceptedRef = useRef(false)
  const { touched, touch, touchAll } = useTouchedFields()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useEffect(() => {
    if (isConnected && token && !inspectedRef.current) {
      inspectedRef.current = true
      inspectInvitation(token)
    }
  }, [inspectInvitation, isConnected, token])

  useSocketEvent(EVENTS.MANAGER_INVITATION_DETAILS, (invitation) => {
    setDetails(invitation)

    if (invitation.existingAccount && !acceptedRef.current) {
      acceptedRef.current = true
      acceptInvitation(token)
    } else {
      setState('form')
    }
  })

  useSocketEvent(EVENTS.MANAGER_INVITATION_ACCEPTED, ({ state: resultState, username: name }) => {
    setUsername(name)
    setState(resultState === 'active' ? 'active' : 'pending')
  })

  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, (error) => {
    if (
      state === 'submitting' &&
      (hasFieldError(error, 'username') || hasFieldError(error, 'password'))
    ) {
      setFormError(error)
      setState('form')

      return
    }

    setMessage(error)
    setState('error')
  })

  const usernameOk = validateManagerUsername(username).ok
  const passwordOk = validateManagerPassword(password).ok
  const formValid = usernameOk && passwordOk && password === confirm

  const handleSubmit = () => {
    touchAll(['username', 'password', 'confirm'])

    if (!formValid || state !== 'form') {
      return
    }

    setState('submitting')
    setFormError('')
    acceptInvitation(token, username, password)
  }

  return (
    <AuthShell isConnected={isConnected}>
      <main className="z-10 flex w-full max-w-md flex-col gap-5 rounded-xl bg-white p-6 shadow-xl">
        {(state === 'loading' || state === 'submitting') && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader className="h-16" />
            <p className="font-bold">
              {state === 'loading' ? t('Checking invitation…') : t('Accepting invitation…')}
            </p>
          </div>
        )}

        {state === 'form' && (
          <>
            <header>
              <p className="text-xs font-bold tracking-widest text-primary uppercase">{t('Invitation')}</p>
              <h1 className="mt-1 text-2xl font-black">{t('Join Bazoot')}</h1>
              <p className="mt-2 text-sm font-semibold text-gray-500">
                {t('Join {organization} as {role} using {email}.', {
                  organization: details.organization?.name ?? t('this organization'),
                  role: t(details.role),
                  email: details.email,
                })}
              </p>
            </header>
            <label className="text-sm font-bold text-gray-800">
              {t('Choose a username')}
              <Input
                className="mt-1.5 w-full rounded-md text-base"
                invalid={
                  (touched.username && !usernameOk) || hasFieldError(formError, 'username')
                }
                valid={touched.username && usernameOk}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  setFormError('')
                }}
                autoComplete="username"
                onBlur={() => touch('username')}
              />
            </label>
            <label className="text-sm font-bold text-gray-800">
              {t('Choose a password')}
              <Input
                type="password"
                className="mt-1.5 w-full rounded-md text-base"
                invalid={
                  (touched.password && !passwordOk) || hasFieldError(formError, 'password')
                }
                valid={touched.password && passwordOk}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setFormError('')
                }}
                autoComplete="new-password"
                onBlur={() => touch('password')}
              />
            </label>
            <label className="text-sm font-bold text-gray-800">
              {t('Confirm password')}
              <Input
                type="password"
                className="mt-1.5 w-full rounded-md text-base"
                invalid={touched.confirm && confirm !== password}
                valid={touched.confirm && confirm !== '' && confirm === password}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                onBlur={() => touch('confirm')}
              />
            </label>
            <p className="text-xs font-semibold text-gray-400">
              {t('An admin must approve your account after you accept.')}
            </p>
            <Button onClick={handleSubmit} disabled={!formValid}>
              {t('Accept invitation')}
            </Button>
          </>
        )}

        {state === 'active' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-black">{t('Invitation accepted')}</h1>
            <p className="text-sm font-semibold text-gray-500">
              {t('Your existing account {username} is active.', { username })}
            </p>
            <Link className="btn-shadow w-full rounded-md bg-primary p-2 text-lg font-semibold text-white" to="/manager">
              <span>{t('Go to login')}</span>
            </Link>
          </div>
        )}

        {state === 'pending' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-black">{t('Waiting for approval')}</h1>
            <p className="text-sm font-semibold text-gray-500">
              {t('Your account {username} is ready. An admin must approve it before you can log in.', { username })}
            </p>
            <Link className="text-sm font-bold text-gray-600 hover:underline" to="/manager">
              {t('Back to login')}
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-2xl font-black">{t('Invitation unavailable')}</h1>
            <p className="text-sm font-semibold text-gray-500">{t(message)}</p>
            <Link className="text-sm font-bold text-gray-600 hover:underline" to="/manager">
              {t('Back to login')}
            </Link>
          </div>
        )}
      </main>
    </AuthShell>
  )
}
