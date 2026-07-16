import { EVENTS } from '@bazoot/shared/events'
import { validateEmail, validateManagerPassword } from '@bazoot/shared/validation'
import { useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ClockIcon, LogoutIcon, TrashIcon, UserIcon, UsersIcon } from '../components/icons/ui.jsx'
import {
  ManagerContentHeader,
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Tag } from '../components/ui/Tag.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'
import {
  getManagerDefaultOrganization,
  setManagerDefaultOrganization,
} from '../utils/managerSession.js'

const fieldLabel = 'text-sm font-bold text-gray-800'
const fieldInput = 'mt-1.5 w-full rounded-md p-2 text-sm'
const fieldSelect =
  'mt-1.5 w-full rounded-md border-2 border-gray-300 bg-white p-2 text-sm font-semibold focus:border-primary focus:outline-none'

const FieldHint = ({ state = 'idle', children }) => {
  const color =
    state === 'ok' ? 'text-green-600'
      : state === 'bad' ? 'text-red-500'
        : 'text-gray-400'

  return (
    <p className={`mt-1 text-xs font-semibold ${color}`}>
      {state === 'ok' && '✓ '}
      {children}
    </p>
  )
}

const describeDevice = (userAgent = '') => {
  const browser =
    userAgent.match(/Edg\//) ? 'Microsoft Edge'
      : userAgent.match(/Firefox\//) ? 'Firefox'
        : userAgent.match(/Chrome\//) ? 'Chrome'
          : userAgent.match(/Safari\//) ? 'Safari'
            : 'Unknown browser'
  const platform =
    userAgent.match(/Windows/) ? 'Windows'
      : userAgent.match(/Android/) ? 'Android'
        : userAgent.match(/iPhone/) ? 'iPhone'
          : userAgent.match(/iPad/) ? 'iPad'
            : userAgent.match(/Macintosh/) ? 'macOS'
              : userAgent.match(/Linux/) ? 'Linux'
                : 'unknown device'

  return `${browser} on ${platform}`
}

const displayAddress = (address) => {
  const normalized = String(address || '').replace(/^::ffff:/, '').trim()

  return ['', '::1', '127.0.0.1', 'localhost'].includes(normalized) ? '' : normalized
}

const formatSessionDate = (session, locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(session.lastSeenAt ?? session.createdAt),
  )

const describeSessionActivity = (session, locale, t) => {
  const address = displayAddress(session.address)
  const date = formatSessionDate(session, locale)

  return address
    ? t('Last active {date} · IP {address}', { address, date })
    : t('Last active {date}', { date })
}

const SettingsSection = ({ icon, title, description, danger = false, children }) => {
  const { t } = useTranslation()

  return (
    <section
      className={
        danger
          ? 'rounded-xl border border-red-200 bg-red-50/60 p-4 shadow-sm sm:p-5'
          : 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5'
      }
    >
      <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
        <span
          className={`shrink-0 rounded-lg p-2 ${danger ? 'bg-red-100 text-red-700' : 'bg-orange-50 text-primary'}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className={`text-base font-extrabold ${danger ? 'text-red-950' : 'text-gray-950'}`}>{t(title)}</h2>
          <p className={`mt-1 text-sm leading-relaxed font-semibold ${danger ? 'text-red-700' : 'text-gray-600'}`}>
            {t(description)}
          </p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const SecurityActionRow = ({ title, description, action, children }) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-extrabold text-gray-950">{t(title)}</h3>
        {description && (
          <p className="mt-1 text-sm leading-relaxed font-semibold text-gray-600">
            {t(description)}
          </p>
        )}
        {children}
      </div>
      <div className="shrink-0 sm:ml-4">{action}</div>
    </div>
  )
}

const AccountFormDialog = ({
  open,
  title,
  description,
  submitLabel,
  submittingLabel = 'Saving…',
  submitDisabled,
  submitting,
  onSubmit,
  onCancel,
  children,
}) => {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    restoreFocusRef.current = document.activeElement
    window.setTimeout(() => dialogRef.current?.querySelector('input')?.focus(), 0)

    return () => {
      const previous = restoreFocusRef.current

      if (previous && document.contains(previous) && typeof previous.focus === 'function') {
        previous.focus()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault()
        onCancel()

        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusable = dialogRef.current?.querySelectorAll(
        'input, button:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )

      if (!focusable || focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel, submitting])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!submitting) {
          onCancel()
        }
      }}
      role="presentation"
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="anim-show w-full max-w-md p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id={titleId} className="text-lg font-extrabold text-gray-950">
            {title}
          </h2>
          <p id={descriptionId} className="mt-1 text-sm font-semibold text-gray-500">
            {description}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3">{children}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="text-sm sm:px-4" onClick={onCancel} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button className="text-sm sm:px-4" onClick={onSubmit} disabled={submitting || submitDisabled}>
            {submitting ? t(submittingLabel) : submitLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}

const ChangeEmailDialog = ({
  open,
  email,
  emailPassword,
  emailOk,
  emailFormValid,
  pending,
  touched,
  fieldError,
  onEmailChange,
  onPasswordChange,
  onBlur,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation()
  const submitting = pending === 'email'

  return (
    <AccountFormDialog
      open={open}
      title={t('Change email')}
      description={t('Enter the new email address and confirm with your password.')}
      submitLabel={t('Change email')}
      submittingLabel="Sending…"
      submitDisabled={!emailFormValid}
      submitting={submitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
    >
      <label className={fieldLabel}>
        {t('New email address')}
        <Input
          type="email"
          className={fieldInput}
          invalid={(touched.email && !emailOk) || (fieldError?.action === 'email' && hasFieldError(fieldError.message, 'email'))}
          valid={touched.email && emailOk}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="email"
          onBlur={() => onBlur('email')}
          disabled={submitting}
        />
        <FieldHint state={email === '' ? 'idle' : emailOk ? 'ok' : 'bad'}>
          {t('We will send a verification email to this address.')}
        </FieldHint>
      </label>

      <label className={fieldLabel}>
        {t('Current password')}
        <Input
          type="password"
          className={fieldInput}
          invalid={(touched.emailPassword && !emailPassword) || (fieldError?.action === 'email' && hasFieldError(fieldError.message, 'password'))}
          value={emailPassword}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="current-password"
          onBlur={() => onBlur('emailPassword')}
          disabled={submitting}
        />
        <FieldHint state={emailPassword ? 'ok' : 'idle'}>
          {t('Required to confirm it is you')}
        </FieldHint>
      </label>
    </AccountFormDialog>
  )
}

const ChangePasswordDialog = ({
  open,
  currentPassword,
  newPassword,
  confirmPassword,
  passwordOk,
  confirmPasswordOk,
  passwordFormValid,
  pending,
  touched,
  fieldError,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onBlur,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation()
  const submitting = pending === 'password'

  return (
    <AccountFormDialog
      open={open}
      title={t('Change password')}
      description={t('Enter your current password, then choose a new one.')}
      submitLabel={t('Update password')}
      submitDisabled={!passwordFormValid}
      submitting={submitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
    >
      <label className={fieldLabel}>
        {t('Current password')}
        <Input
          type="password"
          className={fieldInput}
          invalid={
            (touched.currentPassword && !currentPassword) ||
            (fieldError?.action === 'password' &&
              (/current password/i.test(fieldError.message) ||
                /both passwords|required/i.test(fieldError.message)))
          }
          value={currentPassword}
          onChange={(event) => onCurrentPasswordChange(event.target.value)}
          autoComplete="current-password"
          onBlur={() => onBlur('currentPassword')}
          disabled={submitting}
        />
        <FieldHint state={currentPassword ? 'ok' : 'idle'}>
          {t('Required to confirm it is you')}
        </FieldHint>
      </label>

      <label className={fieldLabel}>
        {t('New password')}
        <Input
          type="password"
          className={fieldInput}
          invalid={
            (touched.newPassword && !passwordOk) ||
            (fieldError?.action === 'password' &&
              hasFieldError(fieldError.message, 'password') &&
              !/current password|passwords do not match/i.test(fieldError.message))
          }
          valid={touched.newPassword && passwordOk}
          value={newPassword}
          onChange={(event) => onNewPasswordChange(event.target.value)}
          placeholder={t('At least 8 characters')}
          autoComplete="new-password"
          onBlur={() => onBlur('newPassword')}
          disabled={submitting}
        />
        <FieldHint state={newPassword === '' ? 'idle' : passwordOk ? 'ok' : 'bad'}>
          {t('At least 8 characters')}
        </FieldHint>
      </label>

      <label className={fieldLabel}>
        {t('Confirm password')}
        <Input
          type="password"
          className={fieldInput}
          invalid={
            (touched.confirmPassword && !confirmPasswordOk) ||
            (fieldError?.action === 'password' && /passwords do not match/i.test(fieldError.message))
          }
          valid={touched.confirmPassword && confirmPasswordOk}
          value={confirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          autoComplete="new-password"
          onBlur={() => onBlur('confirmPassword')}
          disabled={submitting}
        />
        <FieldHint state={confirmPassword === '' ? 'idle' : confirmPasswordOk ? 'ok' : 'bad'}>
          {confirmPassword && !confirmPasswordOk ? t('Passwords do not match') : t('Both passwords must match')}
        </FieldHint>
      </label>
    </AccountFormDialog>
  )
}

export const AccountSettingsScreen = ({
  currentUsername,
  organizations,
  currentOrganizationId,
  onBack,
}) => {
  const {
    getAccountSettings,
    changeOwnEmail,
    changePassword,
    resendVerification,
    revokeManagerSession,
    deleteOwnAccount,
  } = useGame()
  const { t, locale, locales, setLocale } = useTranslation()
  const [account, setAccount] = useState(null)
  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [defaultWorkspace, setDefaultWorkspace] = useState(
    () => getManagerDefaultOrganization() ?? currentOrganizationId,
  )
  const [pending, setPending] = useState(null)
  const [fieldError, setFieldError] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const { touched, touch, touchAll, clearTouched } = useTouchedFields()

  useEffect(() => {
    getAccountSettings()
  }, [getAccountSettings])

  useEffect(() => {
    if (!organizations.some((organization) => organization.id === defaultWorkspace)) {
      setDefaultWorkspace(currentOrganizationId)
      setManagerDefaultOrganization(currentOrganizationId)
    }
  }, [currentOrganizationId, defaultWorkspace, organizations])

  useSocketEvent(EVENTS.MANAGER_ACCOUNT_SETTINGS, (settings) => {
    setAccount(settings)
    setEmail(settings.email ?? '')

    if (pending === 'password') {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setConfirmAction(null)
      clearTouched()
      toast.success(t('Password changed'))
    } else if (pending === 'email') {
      setEmailPassword('')
      setConfirmAction(null)
      clearTouched()
      toast.success(t('Verification email sent to the new address'))
    } else if (pending?.startsWith('session-')) {
      toast.success(t('Device logged out'))
    }

    setPending(null)
    setFieldError(null)
  })

  const handleError = (message) => {
    setFieldError({ action: pending, message })
    setPending(null)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const clearFieldError = () => setFieldError(null)
  const actionError = (action) => fieldError?.action === action
  const emailOk = validateEmail(email).ok
  const emailFormValid = emailOk && Boolean(emailPassword)
  const passwordOk = validateManagerPassword(newPassword).ok
  const confirmPasswordOk = confirmPassword !== '' && confirmPassword === newPassword
  const passwordFormValid = Boolean(currentPassword) && passwordOk && confirmPasswordOk
  const resetPasswordForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const closePasswordDialog = () => {
    if (pending === 'password') {
      return
    }

    resetPasswordForm()
    setConfirmAction(null)
    if (fieldError?.action === 'password') {
      setFieldError(null)
    }
    clearTouched()
  }

  const closeEmailDialog = () => {
    if (pending === 'email') {
      return
    }

    setEmail(account?.email ?? '')
    setEmailPassword('')
    setConfirmAction(null)
    if (fieldError?.action === 'email') {
      setFieldError(null)
    }
    clearTouched()
  }

  const handleEmailChange = () => {
    touchAll(['email', 'emailPassword'])

    if (!emailOk) {
      setFieldError({ action: 'email', message: 'Please enter a valid email address' })
      toast.error(t('Please enter a valid email address'))

      return
    }

    if (!emailPassword) {
      setFieldError({ action: 'email', message: 'Enter your current password' })
      toast.error(t('Enter your current password to change your email'))

      return
    }

    setPending('email')
    clearFieldError()
    changeOwnEmail(emailPassword, email)
  }

  const handleChangePassword = () => {
    touchAll(['currentPassword', 'newPassword', 'confirmPassword'])

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFieldError({ action: 'password', message: 'Both passwords are required' })
      toast.error(t('Both passwords are required'))

      return
    }

    if (!passwordOk) {
      setFieldError({ action: 'password', message: 'Password must be at least 8 characters' })
      toast.error(t('At least 8 characters'))

      return
    }

    if (!confirmPasswordOk) {
      setFieldError({ action: 'password', message: 'Passwords do not match' })
      toast.error(t('Passwords do not match'))

      return
    }

    clearFieldError()
    setPending('password')
    changePassword(currentPassword, newPassword)
  }

  const handleDefaultWorkspace = (organizationId) => {
    setDefaultWorkspace(organizationId)
    setManagerDefaultOrganization(organizationId)
    toast.success(t('Default workspace updated'))
  }

  const handleDeleteAccount = () => {
    touch('deletePassword')

    if (!deletePassword) {
      setFieldError({ action: 'delete', message: 'Enter your current password' })
      toast.error(t('Enter your current password before deleting your account'))

      return
    }

    setConfirmAction(null)
    setPending('delete')
    clearFieldError()
    deleteOwnAccount(deletePassword)
  }

  const createdLabel = account?.createdAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(account.createdAt))
    : '—'

  return (
    <ManagerPageFrame>
      <ManagerPanel>
        <ManagerPageHeader
          eyebrow="Bazoot account"
          title="Account settings"
          description="Manage your identity, login security, and personal preferences across workspaces."
        />
      </ManagerPanel>

      <ManagerPanel>
        <ManagerContentHeader
          title="Personal settings"
          description="Start with your account summary, then adjust preferences and security when needed."
        />
        <div className="flex flex-col gap-5 bg-gray-50/70 p-5 lg:p-7">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-lg font-black text-primary">
                  {(account?.username ?? currentUsername ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-gray-500 uppercase">{t('Username')}</p>
                  <p className="truncate text-lg font-black text-gray-950">{account?.username ?? currentUsername}</p>
                </div>
              </div>

              <dl className="grid min-w-0 flex-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                <div className="min-w-0">
                  <dt className="text-xs font-bold tracking-wide text-gray-500 uppercase">{t('Email status')}</dt>
                  <dd className="mt-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-extrabold text-gray-950">
                        {account?.email || t('No email linked')}
                      </span>
                      <Tag tone={account?.emailVerified ? 'success' : 'warning'}>
                        {account?.emailVerified ? t('Verified') : t('Verification pending')}
                      </Tag>
                    </div>
                    {account?.email && !account.emailVerified && (
                      <button
                        type="button"
                        className="mt-2 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        onClick={() => resendVerification(currentUsername)}
                      >
                        {t('Resend verification email')}
                      </button>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-bold tracking-wide text-gray-500 uppercase">{t('Member since')}</dt>
                  <dd className="mt-1 text-sm font-extrabold text-gray-950">{createdLabel}</dd>
                </div>

                <div>
                  <dt className="text-xs font-bold tracking-wide text-gray-500 uppercase">{t('Devices signed in')}</dt>
                  <dd className="mt-1 text-sm font-extrabold text-gray-950">
                    {account?.sessions?.length ?? 0}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-5">
            <SettingsSection
              icon={<UsersIcon className="h-5 w-5" />}
              title="Preferences"
              description="Choose how Bazoot opens and which language it uses for you."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldLabel}>
                  {t('Preferred language')}
                  <select
                    aria-label={t('Preferred language')}
                    className={fieldSelect}
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                  >
                    {locales.map(({ code, label, flag }) => (
                      <option key={code} value={code}>
                        {flag} {label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-xs leading-relaxed font-semibold text-gray-500">
                    {t('Used for your manager screens and account messages.')}
                  </span>
                </label>
                <label className={fieldLabel}>
                  {t('Default workspace')}
                  <select
                    aria-label={t('Default workspace')}
                    className={fieldSelect}
                    value={defaultWorkspace}
                    onChange={(event) => handleDefaultWorkspace(event.target.value)}
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name} · {t(organization.role)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-xs leading-relaxed font-semibold text-gray-500">
                    {t('Bazoot opens this workspace first after login.')}
                  </span>
                </label>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={<ClockIcon className="h-5 w-5" />}
              title="Login security"
              description="Change your sign-in details and review where your account is currently active."
            >
              <div className="grid gap-3 xl:grid-cols-2">
                <SecurityActionRow
                  title="Email address"
                  description="Used for verification and account recovery."
                  action={
                    <Button
                      variant="secondary"
                      className="w-full text-sm sm:w-auto sm:px-4"
                      onClick={() => {
                        setEmail(account?.email ?? '')
                        setEmailPassword('')
                        setConfirmAction('email')
                        clearTouched()
                        clearFieldError()
                      }}
                      disabled={pending === 'email'}
                    >
                      {t('Change email')}
                    </Button>
                  }
                >
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-gray-700">
                      {account?.email || t('No email linked')}
                    </p>
                    <Tag tone={account?.emailVerified ? 'success' : 'warning'}>
                      {account?.emailVerified ? t('Verified') : t('Verification pending')}
                    </Tag>
                  </div>
                </SecurityActionRow>

                <SecurityActionRow
                  title="Password"
                  description="Change it when someone else may know it."
                  action={
                    <Button
                      variant="secondary"
                      className="w-full text-sm sm:w-auto sm:px-4"
                      onClick={() => setConfirmAction('password')}
                      disabled={pending === 'password'}
                    >
                      {t('Change password')}
                    </Button>
                  }
                />
              </div>
            </SettingsSection>

            <SettingsSection
              icon={<UserIcon className="h-5 w-5" />}
              title="Devices signed in"
              description="Review where your account is being used and log out devices you do not recognize."
            >
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {(account?.sessions ?? []).map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-3 border-b border-gray-100 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-extrabold text-gray-950">
                          {describeDevice(session.userAgent)}
                        </p>
                        {session.current && <Tag tone="success">{t('This device')}</Tag>}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed font-semibold text-gray-600">
                        {describeSessionActivity(session, locale, t)}
                      </p>
                    </div>
                    {!session.current && (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 sm:self-center"
                        onClick={() => {
                          setPending(`session-${session.id}`)
                          revokeManagerSession(session.id)
                        }}
                        disabled={pending === `session-${session.id}`}
                      >
                        <LogoutIcon className="h-4 w-4" />
                        {pending === `session-${session.id}` ? t('Logging out…') : t('Log out')}
                      </button>
                    )}
                  </div>
                ))}
                {account?.sessions?.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm font-semibold text-gray-600">
                    {t('No active sessions found')}
                  </p>
                )}
              </div>
            </SettingsSection>

            <SettingsSection
              danger
              icon={<TrashIcon className="h-5 w-5" />}
              title="Delete account"
              description="Permanently remove your account and leave every workspace."
            >
              <div className="rounded-lg border border-red-200 bg-white/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className={`${fieldLabel} min-w-0 flex-1 text-red-950`}>
                    {t('Current password')}
                    <Input
                      type="password"
                      className={fieldInput}
                      invalid={
                        (touched.deletePassword && !deletePassword) ||
                        (actionError('delete') && hasFieldError(fieldError.message, 'password'))
                      }
                      value={deletePassword}
                      onChange={(event) => {
                        setDeletePassword(event.target.value)
                        clearFieldError()
                      }}
                      autoComplete="current-password"
                      onBlur={() => touch('deletePassword')}
                    />
                  </label>
                  <Button
                    variant="danger"
                    className="shrink-0 text-sm"
                    onClick={() => setConfirmAction('delete')}
                    disabled={pending === 'delete' || !deletePassword}
                  >
                    {t('Delete account')}
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-relaxed font-bold text-red-700">
                  {t('You must assign another owner in every workspace you own before deleting your account.')}
                </p>
              </div>
            </SettingsSection>
          </div>
        </div>
      </ManagerPanel>

      <ChangeEmailDialog
        open={confirmAction === 'email'}
        email={email}
        emailPassword={emailPassword}
        emailOk={emailOk}
        emailFormValid={emailFormValid}
        pending={pending}
        touched={touched}
        fieldError={fieldError}
        onEmailChange={(value) => {
          setEmail(value)
          clearFieldError()
        }}
        onPasswordChange={(value) => {
          setEmailPassword(value)
          clearFieldError()
        }}
        onBlur={touch}
        onSubmit={handleEmailChange}
        onCancel={closeEmailDialog}
      />

      <ChangePasswordDialog
        open={confirmAction === 'password'}
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        passwordOk={passwordOk}
        confirmPasswordOk={confirmPasswordOk}
        passwordFormValid={passwordFormValid}
        pending={pending}
        touched={touched}
        fieldError={fieldError}
        onCurrentPasswordChange={(value) => {
          setCurrentPassword(value)
          clearFieldError()
        }}
        onNewPasswordChange={(value) => {
          setNewPassword(value)
          clearFieldError()
        }}
        onConfirmPasswordChange={(value) => {
          setConfirmPassword(value)
          clearFieldError()
        }}
        onBlur={touch}
        onSubmit={handleChangePassword}
        onCancel={closePasswordDialog}
      />

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title={t('Permanently delete your account?')}
        confirmLabel={t('Delete account')}
        danger
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmAction(null)}
      >
        {t('This cannot be undone. Your workspace access and all active sessions will be removed.')}
      </ConfirmDialog>
    </ManagerPageFrame>
  )
}
