import { PlusIcon, UsersIcon } from '../components/icons/ui.jsx'
import {
  ManagerContentHeader,
  ManagerEmptyState,
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useTranslation } from '../i18n/index.js'

export const WorkspacesScreen = ({ organizations, onOpen, onCreate }) => {
  const { t } = useTranslation()

  return <ManagerPageFrame>
    <ManagerPanel>
      <ManagerPageHeader
        eyebrow={t('Your workspaces')}
        title={t('Choose a workspace')}
        description={t('Each workspace has its own quizzes, members, invitations, and hosted games.')}
        actions={<Button className="flex items-center justify-center gap-2 text-sm" onClick={onCreate}>
          <PlusIcon className="h-5 w-5" />
          {t('Create workspace')}
        </Button>}
      />
    </ManagerPanel>

    <ManagerPanel>
      <ManagerContentHeader
        title={t('Workspace directory')}
        description={
          organizations.length === 1
            ? t('1 workspace available to your account.')
            : t('{count} workspaces available to your account.', { count: organizations.length })
        }
      />
      {organizations.length === 0 ? (
        <ManagerEmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title={t('No workspaces found')}
          description={t('Create a workspace to start organizing quizzes and members.')}
        />
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7">
          {organizations.map((organization) => (
          <button
            key={organization.id}
            type="button"
            onClick={() => onOpen(organization.id)}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary/40 hover:bg-orange-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary">
              <UsersIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-black text-gray-950">
                {organization.name}
              </span>
              <span className="mt-1 inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 capitalize group-hover:bg-white">
                {t(organization.role)}
              </span>
            </span>
            <span className="text-xl font-black text-gray-300 transition-colors group-hover:text-primary">
              →
            </span>
          </button>
          ))}
        </div>
      )}
    </ManagerPanel>
  </ManagerPageFrame>
}
