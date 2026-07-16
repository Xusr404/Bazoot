import clsx from 'clsx'
import { useTranslation } from '../../i18n/index.js'
import { ChevronDownIcon, LogoutIcon, UserIcon, UsersIcon } from '../icons/ui.jsx'
import { Menu } from '../ui/Menu.jsx'

// Compact account menu pinned to the dashboard's upper-right.
export const AccountMenu = ({ username, onAccountSettings, onAccounts, onLogout }) => {
  const { t } = useTranslation()

  return (
    <Menu
      align="right"
      menuLabel={t('Account menu')}
      header={
        username ? (
          <>
            <p className="text-xs font-semibold text-gray-400">{t('Signed in as')}</p>
            <p className="truncate text-sm font-bold text-gray-800">{username}</p>
          </>
        ) : null
      }
      items={[
        {
          label: t('Account settings'),
          icon: <UserIcon className="h-4 w-4" />,
          onSelect: onAccountSettings,
        },
        {
          label: t('Workspace members'),
          icon: <UsersIcon className="h-4 w-4" />,
          onSelect: onAccounts,
        },
        { separator: true },
        {
          label: t('Log out'),
          icon: <LogoutIcon className="h-4 w-4" />,
          onSelect: onLogout,
        },
      ]}
      renderTrigger={({ open, triggerProps }) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={t('My account')}
          className={clsx(
            'flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 shadow-sm transition-colors',
            'hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            open && 'bg-gray-50',
          )}
        >
          <UserIcon className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t('My account')}</span>
          <ChevronDownIcon
            className={clsx('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      )}
    />
  )
}
