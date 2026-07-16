import { EVENTS } from '@bazoot/shared/events'
import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'

import { Tag } from '../components/ui/Tag.jsx'
import { NumericInput } from '../components/ui/NumericInput.jsx'
import {
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import { useTranslation } from '../i18n/index.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'live', label: 'Live Games' },
  { id: 'server', label: 'Server' },
]

const StatCard = ({ label, value, sub, tone = 'default' }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">{label}</p>
    <p
      className={clsx(
        'mt-2 text-4xl font-black tabular-nums',
        tone === 'warning' ? 'text-amber-500' : tone === 'danger' ? 'text-red-500' : 'text-gray-950',
      )}
    >
      {value ?? '—'}
    </p>
    {sub && <p className="mt-1 text-xs font-semibold text-gray-400">{sub}</p>}
  </div>
)

const EmptyState = ({ children }) => (
  <div className="flex min-h-40 items-center justify-center py-10 text-sm font-bold text-gray-400">
    {children}
  </div>
)

const thClass = 'px-5 py-3 text-left text-[11px] font-bold tracking-wide text-gray-500 uppercase'
const tdClass = 'px-5 py-4'

const ConfigRow = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
    <span className="text-sm font-semibold text-gray-600">{label}</span>
    <span
      className={clsx(
        'text-sm font-bold',
        tone === 'success' ? 'text-green-600' : tone === 'warning' ? 'text-amber-500' : tone === 'danger' ? 'text-red-500' : 'text-gray-900',
      )}
    >
      {value}
    </span>
  </div>
)

const NumberSetting = ({ id, label, value, min, max, suffix, onChange }) => (
  <label
    htmlFor={id}
    className="flex flex-col gap-2 border-b border-gray-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
  >
    <span className="text-sm font-semibold text-gray-600">{label}</span>
    <span className="flex items-center gap-2">
      <NumericInput
        id={id}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? '' : Number.parseInt(event.target.value, 10))
        }
        className="h-10 w-36 shadow-sm"
      />
      {suffix && <span className="w-16 text-sm font-semibold text-gray-400">{suffix}</span>}
    </span>
  </label>
)

const ToggleSetting = ({ id, label, checked, onChange }) => (
  <label
    htmlFor={id}
    className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0"
  >
    <span className="text-sm font-semibold text-gray-600">{label}</span>
    <input
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange(event.target.checked)}
      className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
    />
  </label>
)

const isIntegerInRange = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max

export const AdminScreen = ({ onBack }) => {
  const { t, locale } = useTranslation()
  const {
    adminGetOverview,
    adminListAllAccounts,
    adminListAllWorkspaces,
    adminGetActiveRooms,
    adminGetServerConfig,
    adminUpdateServerSettings,
  } = useGame()

  const [activeTab, setActiveTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState(null)
  const [workspaces, setWorkspaces] = useState(null)
  const [liveRooms, setLiveRooms] = useState(null)
  const [serverConfig, setServerConfig] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)

  useEffect(() => {
    adminGetOverview()
    adminGetServerConfig()
  }, [adminGetOverview, adminGetServerConfig])

  useEffect(() => {
    if (activeTab === 'users' && users === null) adminListAllAccounts()
    if (activeTab === 'workspaces' && workspaces === null) adminListAllWorkspaces()
    if (activeTab === 'live') adminGetActiveRooms()
  }, [activeTab, users, workspaces, adminListAllAccounts, adminListAllWorkspaces, adminGetActiveRooms])

  useSocketEvent(EVENTS.ADMIN_OVERVIEW, useCallback((data) => setOverview(data), []))
  useSocketEvent(EVENTS.ADMIN_ALL_ACCOUNTS, useCallback((data) => setUsers(data), []))
  useSocketEvent(EVENTS.ADMIN_ALL_WORKSPACES, useCallback((data) => setWorkspaces(data), []))
  useSocketEvent(EVENTS.ADMIN_ACTIVE_ROOMS, useCallback((data) => setLiveRooms(data), []))
  useSocketEvent(
    EVENTS.ADMIN_SERVER_CONFIG,
    useCallback((data) => {
      setServerConfig(data)
      setSettingsDraft({
        allowRegistration: data.allowRegistration,
        maxPlayersPerRoom: data.maxPlayersPerRoom,
        questionTimeLimit: data.questionTimeLimit,
        scoreMax: data.scoreMax,
      })
      setSettingsSaving(false)
      setSettingsDirty(false)
    }, []),
  )
  useSocketEvent(
    EVENTS.GAME_ERROR_MESSAGE,
    useCallback(() => {
      setSettingsSaving(false)
    }, []),
  )

  const handleRefreshRooms = () => {
    setLiveRooms(null)
    adminGetActiveRooms()
  }

  const updateSettingsDraft = (key, value) => {
    setSettingsDraft((current) => ({ ...current, [key]: value }))
    setSettingsDirty(true)
  }

  const settingsValid =
    settingsDraft &&
    typeof settingsDraft.allowRegistration === 'boolean' &&
    isIntegerInRange(settingsDraft.maxPlayersPerRoom, 1, 500) &&
    isIntegerInRange(settingsDraft.questionTimeLimit, 5, 300) &&
    isIntegerInRange(settingsDraft.scoreMax, 1, 100000)

  const handleSaveServerSettings = () => {
    if (!settingsValid || settingsSaving) {
      return
    }

    setSettingsSaving(true)
    adminUpdateServerSettings(settingsDraft)
  }

  return (
    <ManagerPageFrame className="gap-5">
      <ManagerPanel>
        <ManagerPageHeader
          eyebrow="Site administration"
          title="Admin Panel"
          description="Server-wide overview — accounts, workspaces, live games, and configuration."
        />
        <div
          role="tablist"
          aria-label={t('Admin sections')}
          className="flex gap-1 overflow-x-auto px-3 pt-3"
        >
          {TABS.map((tab) => (
            <button
            key={tab.id}
            id={`admin-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`admin-${tab.id}-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              '-mb-px px-4 pb-3 pt-1 text-sm font-extrabold transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-900',
            )}
          >
            {t(tab.label)}
          </button>
          ))}
        </div>
      </ManagerPanel>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div id="admin-overview-panel" role="tabpanel" aria-labelledby="admin-overview-tab" className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={t('Total accounts')} value={overview?.totalAccounts} />
            <StatCard label={t('Workspaces')} value={overview?.totalWorkspaces} />
            <StatCard
              label={t('Active games')}
              value={overview?.activeRooms}
              tone={overview?.activeRooms > 0 ? 'default' : 'default'}
            />
            <StatCard
              label={t('Pending approvals')}
              value={overview?.pendingApprovals}
              tone={overview?.pendingApprovals > 0 ? 'warning' : 'default'}
              sub={overview?.pendingInvitations > 0 ? t('+ {count} open invitations', { count: overview.pendingInvitations }) : undefined}
            />
          </div>

          {overview?.pendingApprovals > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-bold text-amber-800">
                {t('{count} {label} waiting for approval — go to the Members tab in the relevant workspace to approve them.', {
                  count: overview.pendingApprovals,
                  label: overview.pendingApprovals === 1 ? t('account') : t('accounts'),
                })}
              </p>
            </div>
          )}

          {serverConfig && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="font-extrabold text-gray-950">{t('Quick config')}</h2>
              <div className="mt-3">
                <ConfigRow
                  label={t('Public registration')}
                  value={serverConfig.allowRegistration ? t('Enabled') : t('Disabled')}
                  tone={serverConfig.allowRegistration ? 'warning' : 'success'}
                />
                <ConfigRow
                  label={t('Email verification')}
                  value={t(serverConfig.emailVerification)}
                />
                <ConfigRow
                  label={t('Mail delivery')}
                  value={
                    (serverConfig.mailConfigured ?? serverConfig.smtpConfigured)
                      ? t('{provider} configured', { provider: (serverConfig.mailProvider ?? 'smtp').toUpperCase() })
                      : t('Console mode (no email)')
                  }
                  tone={(serverConfig.mailConfigured ?? serverConfig.smtpConfigured) ? 'success' : 'warning'}
                />
                <ConfigRow label={t('Max players / room')} value={serverConfig.maxPlayersPerRoom} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div id="admin-users-panel" role="tabpanel" aria-labelledby="admin-users-tab">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-extrabold text-gray-950">{t('All accounts')}</h2>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {users
                  ? t('{count} {label} across all workspaces', {
                      count: users.length,
                      label: users.length === 1 ? t('account') : t('accounts'),
                    })
                  : t('Loading…')}
              </p>
            </div>
            {!users ? (
              <EmptyState>{t('Loading accounts…')}</EmptyState>
            ) : users.length === 0 ? (
              <EmptyState>{t('No accounts found')}</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className={clsx(thClass, 'w-[28%]')}>{t('User')}</th>
                      <th className={clsx(thClass, 'w-[20%]')}>{t('Email')}</th>
                      <th className={clsx(thClass, 'w-[10%]')}>{t('Status')}</th>
                      <th className={clsx(thClass, 'w-[42%]')}>{t('Workspaces & roles')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.username} className="transition-colors hover:bg-gray-50/80">
                        <td className={tdClass}>
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-sm font-black text-primary">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <p className="font-extrabold text-gray-950">{user.username}</p>
                              <p className="text-xs text-gray-400">
                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale) : t('Unknown')}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={tdClass}>
                          <p className="truncate text-sm text-gray-700">{user.email || '—'}</p>
                          {user.email && (
                            <Tag tone={user.emailVerified ? 'success' : 'warning'} className="mt-1">
                              {user.emailVerified ? t('Verified') : t('Unverified')}
                            </Tag>
                          )}
                        </td>
                        <td className={tdClass}>
                          <Tag tone={user.approvalPending ? 'warning' : 'success'}>
                            {user.approvalPending ? t('Pending') : t('Active')}
                          </Tag>
                        </td>
                        <td className={tdClass}>
                          <div className="flex flex-wrap gap-1.5">
                            {user.workspaces.length === 0 ? (
                              <span className="text-xs text-gray-400">{t('No workspace')}</span>
                            ) : (
                              user.workspaces.map((ws) => (
                                <span
                                  key={ws.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700"
                                >
                                  {ws.name}
                                  <span className="font-bold text-primary">· {t(ws.role)}</span>
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workspaces */}
      {activeTab === 'workspaces' && (
        <div id="admin-workspaces-panel" role="tabpanel" aria-labelledby="admin-workspaces-tab">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-extrabold text-gray-950">{t('All workspaces')}</h2>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">
                {workspaces
                  ? t('{count} {label}', {
                      count: workspaces.length,
                      label: workspaces.length === 1 ? t('workspace') : t('workspaces'),
                    })
                  : t('Loading…')}
              </p>
            </div>
            {!workspaces ? (
              <EmptyState>{t('Loading workspaces…')}</EmptyState>
            ) : workspaces.length === 0 ? (
              <EmptyState>{t('No workspaces found')}</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-left">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className={clsx(thClass, 'w-[30%]')}>{t('Workspace')}</th>
                      <th className={clsx(thClass, 'w-[20%]')}>{t('Owner(s)')}</th>
                      <th className={clsx(thClass, 'w-[15%]')}>{t('Members')}</th>
                      <th className={clsx(thClass, 'w-[15%]')}>{t('Quizzes')}</th>
                      <th className={clsx(thClass, 'w-[20%]')}>{t('Created')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {workspaces.map((ws) => (
                      <tr key={ws.id} className="transition-colors hover:bg-gray-50/80">
                        <td className={tdClass}>
                          <p className="font-extrabold text-gray-950">{ws.name}</p>
                        </td>
                        <td className={tdClass}>
                          <div className="flex flex-wrap gap-1">
                            {ws.owners.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              ws.owners.map((owner) => (
                                <span key={owner} className="text-sm font-semibold text-gray-700">
                                  {owner}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className={tdClass}>
                          <span className="text-sm font-bold tabular-nums text-gray-900">{ws.memberCount}</span>
                        </td>
                        <td className={tdClass}>
                          <span className="text-sm font-bold tabular-nums text-gray-900">{ws.quizCount}</span>
                        </td>
                        <td className={tdClass}>
                          <span className="text-sm text-gray-500">
                            {ws.createdAt ? new Date(ws.createdAt).toLocaleDateString(locale) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Games */}
      {activeTab === 'live' && (
        <div id="admin-live-panel" role="tabpanel" aria-labelledby="admin-live-tab" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-500">
              {liveRooms
                ? t('{count} active {label}', {
                    count: liveRooms.length,
                    label: liveRooms.length === 1 ? t('game') : t('games'),
                  })
                : t('Loading…')}
            </p>
            <button
              type="button"
              onClick={handleRefreshRooms}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {t('Refresh')}
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {!liveRooms ? (
              <EmptyState>{t('Loading games…')}</EmptyState>
            ) : liveRooms.length === 0 ? (
              <EmptyState>{t('No active games right now')}</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] table-fixed text-left">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className={clsx(thClass, 'w-[18%]')}>{t('PIN')}</th>
                      <th className={clsx(thClass, 'w-[34%]')}>{t('Quiz')}</th>
                      <th className={clsx(thClass, 'w-[24%]')}>{t('Hosted by')}</th>
                      <th className={clsx(thClass, 'w-[24%]')}>{t('Players')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {liveRooms.map((room) => (
                      <tr key={room.gameId} className="transition-colors hover:bg-gray-50/80">
                        <td className={tdClass}>
                          <span className="font-mono text-lg font-black tracking-wider text-primary">
                            {room.inviteCode}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <p className="truncate font-semibold text-gray-900">{room.quizSubject}</p>
                        </td>
                        <td className={tdClass}>
                          <p className="text-sm text-gray-700">{room.hostedBy}</p>
                        </td>
                        <td className={tdClass}>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            {t('{count} {label}', {
                              count: room.playerCount,
                              label: room.playerCount === 1 ? t('player') : t('players'),
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server */}
      {activeTab === 'server' && (
        <div id="admin-server-panel" role="tabpanel" aria-labelledby="admin-server-tab" className="flex flex-col gap-5">
          {!serverConfig ? (
            <EmptyState>{t('Loading server config…')}</EmptyState>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="font-extrabold text-gray-950">{t('Access & registration')}</h2>
                <div className="mt-3">
                  <ToggleSetting
                    id="admin-allow-registration"
                    label={t('Public self-registration')}
                    checked={settingsDraft?.allowRegistration}
                    onChange={(value) => updateSettingsDraft('allowRegistration', value)}
                  />
                  <ConfigRow
                    label={t('Email verification')}
                    value={serverConfig.emailVerification === 'auto' ? t('Auto (enabled when SMTP is set)') : serverConfig.emailVerification === 'on' ? t('Enforced') : t('Disabled')}
                  />
                  <ConfigRow
                    label={t('Mail delivery')}
                    value={
                      (serverConfig.mailConfigured ?? serverConfig.smtpConfigured)
                        ? t('{provider} configured', { provider: (serverConfig.mailProvider ?? 'smtp').toUpperCase() })
                        : t('Not configured — emails print to console')
                    }
                    tone={(serverConfig.mailConfigured ?? serverConfig.smtpConfigured) ? 'success' : 'warning'}
                  />
                  <ConfigRow label={t('Session lifetime')} value={t('{count} days', { count: serverConfig.sessionTtlDays })} />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="font-extrabold text-gray-950">{t('Game settings')}</h2>
                <div className="mt-3">
                  <ConfigRow label={t('Server port')} value={serverConfig.port} />
                  <NumberSetting
                    id="admin-max-players"
                    label={t('Max players per room')}
                    min={1}
                    max={500}
                    value={settingsDraft?.maxPlayersPerRoom}
                    onChange={(value) => updateSettingsDraft('maxPlayersPerRoom', value)}
                  />
                  <NumberSetting
                    id="admin-question-time"
                    label={t('Default question time')}
                    min={5}
                    max={300}
                    suffix={t('seconds')}
                    value={settingsDraft?.questionTimeLimit}
                    onChange={(value) => updateSettingsDraft('questionTimeLimit', value)}
                  />
                  <NumberSetting
                    id="admin-score-max"
                    label={t('Max score per question')}
                    min={1}
                    max={100000}
                    value={settingsDraft?.scoreMax}
                    onChange={(value) => updateSettingsDraft('scoreMax', value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveServerSettings}
                  disabled={!settingsDirty || !settingsValid || settingsSaving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {settingsSaving ? t('Saving…') : t('Save runtime settings')}
                </button>
              </div>

              <p className="text-xs font-semibold text-gray-400">
                {t('Infrastructure settings stay in server environment variables and require a restart after file changes.')}
              </p>
            </>
          )}
        </div>
      )}
    </ManagerPageFrame>
  )
}
