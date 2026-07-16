import clsx from 'clsx'
import logo from '../../assets/logo.png'
import { useTranslation } from '../../i18n/index.js'
import { ChevronDownIcon, ListIcon, MenuIcon, PlusIcon, UsersIcon } from '../icons/ui.jsx'
import { LanguageSwitcher } from '../ui/LanguageSwitcher.jsx'
import { Menu } from '../ui/Menu.jsx'
import { AccountMenu } from './AccountMenu.jsx'

const navItemClass = (active) =>
  clsx(
    'rounded-md px-3 py-2 text-sm font-bold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    active ? 'bg-orange-50 text-primary' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  )

export const ManagerHeader = ({
  activeView,
  accountRole,
  username,
  organization,
  organizations,
  onQuizzes,
  onAccounts,
  onAccountSettings,
  onSettings,
  onWorkspaces,
  onAdmin,
  onSwitchOrganization,
  onCreateOrganization,
  onLogout,
  isSuperAdmin,
}) => {
  const { t } = useTranslation()

  const mobileItems = [
    {
      label: t('Quizzes'),
      icon: <ListIcon className="h-4 w-4" />,
      onSelect: onQuizzes,
    },
    {
      label: t('Members'),
      icon: <UsersIcon className="h-4 w-4" />,
      onSelect: onAccounts,
    },
    {
      label: t('Workspace settings'),
      icon: <ChevronDownIcon className="h-4 w-4 -rotate-90" />,
      onSelect: onSettings,
    },
    {
      label: t('All workspaces'),
      icon: <UsersIcon className="h-4 w-4" />,
      onSelect: onWorkspaces,
    },
    ...(isSuperAdmin
      ? [{ label: t('Admin panel'), icon: <UsersIcon className="h-4 w-4" />, onSelect: onAdmin }]
      : []),
    ...(organization
      ? [
          { separator: true },
          ...organizations.map((candidate) => ({
            label:
              candidate.id === organization.id
                ? t('{name} (current)', { name: candidate.name })
                : candidate.name,
            icon: <UsersIcon className="h-4 w-4" />,
            onSelect: () => onSwitchOrganization(candidate.id),
          })),
          {
            label: t('Create organization'),
            icon: <PlusIcon className="h-4 w-4" />,
            onSelect: onCreateOrganization,
          },
        ]
      : []),
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-gray-200/90 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-3 sm:px-5">
        <Menu
          align="left"
          menuLabel={t('Manager navigation')}
          items={mobileItems}
          renderTrigger={({ open, triggerProps }) => (
            <button
              {...triggerProps}
              type="button"
              aria-label={t('Open manager navigation')}
              className={clsx(
                'flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition-colors md:hidden',
                'hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                open && 'bg-gray-50',
              )}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
        />

        <button
          type="button"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={onQuizzes}
          aria-label={t('Go to quizzes')}
        >
          <img src={logo} className="h-8" alt="Bazoot!" />
        </button>

        {organization && (
          <Menu
            align="left"
            menuLabel={t('Organizations')}
            header={
              <>
                <p className="text-xs font-semibold text-gray-400">{t('Current organization')}</p>
                <p className="truncate text-sm font-bold text-gray-800">{organization.name}</p>
              </>
            }
            items={[
              ...organizations.map((candidate) => ({
                label: candidate.name,
                icon: <UsersIcon className="h-4 w-4" />,
                onSelect: () => onSwitchOrganization(candidate.id),
              })),
              { separator: true },
              {
                label: t('Manage workspaces'),
                icon: <UsersIcon className="h-4 w-4" />,
                onSelect: onWorkspaces,
              },
              {
                label: t('Create organization'),
                icon: <PlusIcon className="h-4 w-4" />,
                onSelect: onCreateOrganization,
              },
            ]}
            renderTrigger={({ open, triggerProps }) => (
              <button
                {...triggerProps}
                type="button"
                className={clsx(
                  'hidden max-w-56 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800 transition-colors sm:flex',
                  'hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  open && 'bg-gray-100',
                )}
              >
                <span className="truncate">{organization.name}</span>
                <ChevronDownIcon className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
              </button>
            )}
          />
        )}

        <nav aria-label={t('Manager')} className="ml-3 hidden items-center gap-1 md:flex">
          <button type="button" className={navItemClass(activeView === 'list')} onClick={onQuizzes}>
            {t('Quizzes')}
          </button>
          <button
            type="button"
            className={navItemClass(activeView === 'accounts')}
            onClick={onAccounts}
          >
            {t('Members')}
          </button>
          <button
            type="button"
            className={navItemClass(activeView === 'settings')}
            onClick={onSettings}
          >
            {t('Settings')}
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              className={navItemClass(activeView === 'admin')}
              onClick={onAdmin}
            >
              {t('Admin')}
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher variant="light" className="hidden sm:inline-flex" />
          <AccountMenu
            username={username}
            onAccountSettings={onAccountSettings}
            onAccounts={onAccounts}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  )
}
