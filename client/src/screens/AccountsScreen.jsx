import { EVENTS } from '@bazoot/shared/events'
import { validateEmail } from '@bazoot/shared/validation'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PlusIcon, TrashIcon, UsersIcon } from '../components/icons/ui.jsx'
import {
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Tag } from '../components/ui/Tag.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'

const actionButton =
  'inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40'

const fieldLabel = 'text-sm font-bold text-gray-800'
const fieldInput = 'mt-1.5 w-full rounded-md p-2.5 text-base'
const fieldSelect =
  'mt-1.5 w-full rounded-md border-2 border-gray-300 bg-white p-2.5 text-base font-semibold focus:border-primary focus:outline-none'

const RESEND_COOLDOWN_S = 60

const RoleTag = ({ role }) => {
  const { t } = useTranslation()

  return (
    <Tag tone={role === 'owner' ? 'primary' : role === 'admin' ? 'neutral' : 'neutral'}>
      {t(role)}
    </Tag>
  )
}

const TableEmptyState = ({ children }) => (
  <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
    <span className="rounded-lg bg-gray-100 p-3 text-gray-400">
      <UsersIcon className="h-6 w-6" />
    </span>
    <p className="text-sm font-bold text-gray-500">{children}</p>
  </div>
)

export const AccountsScreen = ({
  currentUsername,
  currentRole,
  workspaceName,
  onBack,
  onManageAccount,
}) => {
  const { t } = useTranslation()
  const {
    listAccounts,
    listInvitations,
    createInvitation,
    cancelInvitation,
    approveAccount,
    updateAccountRole,
    deleteAccount,
  } = useGame()

  const [accounts, setAccounts] = useState([])
  const [invitations, setInvitations] = useState([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [invitationsLoaded, setInvitationsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteLink, setInviteLink] = useState('')
  const [pending, setPending] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const { touched, touch } = useTouchedFields()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [cancelEmail, setCancelEmail] = useState(null)
  const [resendUntil, setResendUntil] = useState({})
  const [, setTick] = useState(0)
  const isAdmin = currentRole === 'admin' || currentRole === 'owner'
  const activeMemberCount = accounts.filter((account) => !account.approvalPending).length

  useEffect(() => {
    listAccounts()

    if (isAdmin) {
      listInvitations()
    } else {
      setInvitationsLoaded(true)
    }
  }, [isAdmin, listAccounts, listInvitations])

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000)

    return () => clearInterval(interval)
  }, [])

  useSocketEvent(EVENTS.MANAGER_ACCOUNTS_LIST, (list) => {
    setAccounts(list)
    setAccountsLoaded(true)

    if (pending === 'role') {
      toast.success(t('Member role updated'))
    } else if (pending === 'approve') {
      toast.success(t('Member approved'))
    } else if (pending === 'delete') {
      toast.success(t('Member removed'))
    }

    setPending(null)
  })

  useSocketEvent(EVENTS.MANAGER_INVITATIONS_LIST, (list) => {
    setInvitations(list)
    setInvitationsLoaded(true)

    if (cancelEmail) {
      toast.success(t('Invitation cancelled'))
      setCancelEmail(null)
    }
  })

  useSocketEvent(EVENTS.MANAGER_INVITATION_CREATED, ({ email, inviteUrl }) => {
    const wasResend = pending === `resend:${email}`

    setInviteLink(inviteUrl)
    setInviteEmail('')
    setPending(null)
    toast.success(wasResend ? t('Invitation resent') : t('Invitation sent'))
  })

  const handleError = (message) => {
    setErrorMessage(message)
    setPending(null)
    setCancelEmail(null)
  }
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleError)
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleError)

  const handleInvite = () => {
    touch('inviteEmail')

    if (pending || !validateEmail(inviteEmail).ok) {
      setErrorMessage('Please enter a valid email address')
      toast.error(t('Please enter a valid email address'))

      return
    }

    setPending('invite')
    setErrorMessage('')
    createInvitation(inviteEmail, inviteRole)
  }

  const handleRoleChange = (username, role) => {
    if (pending) {
      return
    }

    setPending('role')
    updateAccountRole(username, role)
  }

  const handleApprove = (username) => {
    if (pending) {
      return
    }

    setPending('approve')
    approveAccount(username)
  }

  const handleDelete = (username) => {
    setPending('delete')
    deleteAccount(username)
    setConfirmDelete(null)
  }

  const handleCancelInvitation = (email) => {
    if (cancelEmail) {
      return
    }

    setCancelEmail(email)
    cancelInvitation(email)
  }

  const resendRemaining = (email) =>
    Math.max(0, Math.ceil(((resendUntil[email] ?? 0) - Date.now()) / 1000))

  const handleResendInvitation = (invitation) => {
    if (pending || resendRemaining(invitation.email) > 0) {
      return
    }

    setPending(`resend:${invitation.email}`)
    setResendUntil((current) => ({
      ...current,
      [invitation.email]: Date.now() + RESEND_COOLDOWN_S * 1000,
    }))
    createInvitation(invitation.email, invitation.role)
  }

  const tabs = [
    { id: 'members', label: t('Members'), count: accounts.length },
    { id: 'invitations', label: t('Invitations'), count: invitations.length },
  ]

  return (
    <ManagerPageFrame>
      <ManagerPanel>
        <ManagerPageHeader
          eyebrow={workspaceName}
          title="Workspace members"
          description="Manage who can access this workspace and what each person can do."
          actions={
            isAdmin && (
              <Button
                className="self-start px-4 text-sm"
                onClick={() => setInviteOpen((open) => !open)}
                aria-expanded={inviteOpen}
                aria-controls="invite-member-panel"
              >
                <PlusIcon className="mr-1.5 h-4 w-4" />
                {t('Invite member')}
              </Button>
            )
          }
        />
      </ManagerPanel>

      <section className="overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-orange-100 bg-orange-50/80 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-lg font-extrabold text-gray-950">{t('People with access')}</h2>
            <p className="mt-0.5 text-xs font-semibold text-gray-600">
              {t('{count} active {label}', {
                count: activeMemberCount,
                label: activeMemberCount === 1 ? t('member') : t('members'),
              })}{' '}
              ·{' '}
              {t('{count} pending {label}', {
                count: invitations.length,
                label: invitations.length === 1 ? t('invitation') : t('invitations'),
              })}
            </p>
          </div>
          <div role="tablist" aria-label={t('Workspace access')} className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`${tab.id}-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  '-mb-px flex items-center gap-2 border-b-2 px-0.5 pb-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-600 hover:text-gray-950',
                )}
              >
                {tab.label}
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                    activeTab === tab.id
                      ? 'bg-orange-100 text-primary'
                      : 'bg-white text-gray-600',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isAdmin && inviteOpen && (
          <div id="invite-member-panel" className="border-b border-gray-200 bg-white px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-extrabold text-gray-950">{t('Invite member')}</h2>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {t('Send an email invitation and choose the member’s workspace role.')}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className={`${fieldLabel} flex-1`}>
                {t('Email address')}
                <Input
                  type="email"
                  className={fieldInput}
                  invalid={
                    (touched.inviteEmail && !validateEmail(inviteEmail).ok) ||
                    hasFieldError(errorMessage, 'email')
                  }
                  valid={touched.inviteEmail && validateEmail(inviteEmail).ok}
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value)
                    setErrorMessage('')
                  }}
                  placeholder={t('person@example.com')}
                  onBlur={() => touch('inviteEmail')}
                />
              </label>
              <label className={`${fieldLabel} sm:w-40`}>
                {t('Role')}
                <select
                  className={fieldSelect}
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="editor">{t('Editor')}</option>
                  <option value="admin">{t('Admin')}</option>
                </select>
              </label>
              <Button className="shrink-0 text-base" onClick={handleInvite} disabled={pending === 'invite'}>
                {pending === 'invite' ? t('Sending…') : t('Send invitation')}
              </Button>
            </div>
            {inviteLink && (
              <div className="mt-4 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-500">{inviteLink}</p>
                <button
                  type="button"
                  className={actionButton}
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                >
                  {t('Copy link')}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div id="members-panel" role="tabpanel" aria-labelledby="members-tab">
            {!accountsLoaded ? (
              <TableEmptyState>{t('Loading members…')}</TableEmptyState>
            ) : accounts.length === 0 ? (
              <TableEmptyState>{t('No members found')}</TableEmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left">
                  <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold tracking-wide text-gray-500 uppercase">
                    <tr>
                      <th className="w-[42%] px-5 py-3 sm:px-6">{t('User')}</th>
                      <th className="w-[16%] px-4 py-3">{t('Role')}</th>
                      <th className="w-[18%] px-4 py-3">{t('Status')}</th>
                      <th className="w-[24%] px-5 py-3 text-right sm:px-6">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map((account) => {
                      const isCurrentUser = account.username === currentUsername
                      const canManageOther =
                        isAdmin &&
                        !isCurrentUser &&
                        (account.role !== 'owner' || currentRole === 'owner')

                      return (
                        <tr key={account.username} className="transition-colors hover:bg-gray-50/80">
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-black text-primary">
                                {account.username.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-extrabold text-gray-950">{account.username}</p>
                                  {isCurrentUser && <Tag tone="primary">{t('You')}</Tag>}
                                </div>
                                <p className="mt-0.5 truncate text-sm font-medium text-gray-500">
                                  {account.email || t('No email linked')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {canManageOther ? (
                              <>
                                <label className="sr-only" htmlFor={`role-${account.username}`}>
                                  {t('Role for {username}', { username: account.username })}
                                </label>
                                <select
                                  id={`role-${account.username}`}
                                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-40"
                                  value={account.role}
                                  onChange={(event) => handleRoleChange(account.username, event.target.value)}
                                  disabled={pending === 'role'}
                                >
                                  <option value="editor">{t('Editor')}</option>
                                  <option value="admin">{t('Admin')}</option>
                                  {currentRole === 'owner' && <option value="owner">{t('Owner')}</option>}
                                </select>
                              </>
                            ) : (
                              <RoleTag role={account.role} />
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <Tag tone={account.approvalPending ? 'warning' : 'success'}>
                              {account.approvalPending ? t('Pending approval') : t('Active')}
                            </Tag>
                          </td>
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {isCurrentUser ? (
                                <button type="button" className={actionButton} onClick={onManageAccount}>
                                  {t('Manage account')}
                                </button>
                              ) : (
                                canManageOther && (
                                  <>
                                    {account.approvalPending && (
                                      <button
                                        type="button"
                                        className={`${actionButton} border-green-200 text-green-700 hover:bg-green-50`}
                                        onClick={() => handleApprove(account.username)}
                                        disabled={pending === 'approve'}
                                      >
                                        {t('Approve')}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      aria-label={t('Remove {username}', { username: account.username })}
                                      className={`${actionButton} text-red-600 hover:border-red-200 hover:bg-red-50`}
                                      onClick={() => setConfirmDelete(account.username)}
                                      title={t('Remove from workspace')}
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invitations' && (
          <div id="invitations-panel" role="tabpanel" aria-labelledby="invitations-tab">
            {!invitationsLoaded ? (
              <TableEmptyState>{t('Loading invitations…')}</TableEmptyState>
            ) : !isAdmin ? (
              <TableEmptyState>{t('You do not have permission to view invitations')}</TableEmptyState>
            ) : invitations.length === 0 ? (
              <TableEmptyState>{t('No pending invitations')}</TableEmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] table-fixed text-left">
                  <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold tracking-wide text-gray-500 uppercase">
                    <tr>
                      <th className="w-[42%] px-5 py-3 sm:px-6">{t('Email/User')}</th>
                      <th className="w-[16%] px-4 py-3">{t('Role')}</th>
                      <th className="w-[16%] px-4 py-3">{t('Status')}</th>
                      <th className="w-[26%] px-5 py-3 text-right sm:px-6">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invitations.map((invitation) => (
                      <tr key={invitation.email} className="transition-colors hover:bg-gray-50/80">
                        <td className="px-5 py-4 sm:px-6">
                          <p className="truncate font-extrabold text-gray-950">{invitation.email}</p>
                          <p className="mt-0.5 text-xs font-semibold text-gray-400">
                            {invitation.existingAccount ? t('Existing account') : t('New user')}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <RoleTag role={invitation.role} />
                        </td>
                        <td className="px-4 py-4">
                          <Tag tone="warning">{t('Invited')}</Tag>
                        </td>
                        <td className="px-5 py-4 sm:px-6">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              className={actionButton}
                              onClick={() => handleResendInvitation(invitation)}
                              disabled={Boolean(pending) || resendRemaining(invitation.email) > 0}
                            >
                              {pending === `resend:${invitation.email}`
                                ? t('Resending…')
                                : resendRemaining(invitation.email) > 0
                                  ? t('Resend in {seconds}s', { seconds: resendRemaining(invitation.email) })
                                  : t('Resend')}
                            </button>
                            <button
                              type="button"
                              className={`${actionButton} text-red-600 hover:border-red-200 hover:bg-red-50`}
                              onClick={() => handleCancelInvitation(invitation.email)}
                              disabled={cancelEmail === invitation.email}
                            >
                              {cancelEmail === invitation.email ? t('Cancelling…') : t('Cancel')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t('Remove “{username}” from this workspace?', { username: confirmDelete })}
        confirmLabel={t('Remove member')}
        danger
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      >
        {t('This member loses access to the workspace immediately. Their quizzes stay in the workspace.')}
      </ConfirmDialog>
    </ManagerPageFrame>
  )
}
