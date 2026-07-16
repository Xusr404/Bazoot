import { useEffect, useState } from 'react'
import {
  ManagerContentHeader,
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Input } from '../components/ui/Input.jsx'
import { useTranslation } from '../i18n/index.js'
import { hasFieldError } from '../utils/formErrors.js'
import { useTouchedFields } from '../hooks/useTouchedFields.js'

export const WorkspaceSettingsScreen = ({
  organization,
  organizationCount,
  pending,
  errorMessage,
  onChange,
  onRename,
  onLeave,
  onDelete,
}) => {
  const [name, setName] = useState(organization.name)
  const [confirmAction, setConfirmAction] = useState(null)
  const { t } = useTranslation()
  const { touched, touch } = useTouchedFields()
  const isOwner = organization.role === 'owner'
  const hasOtherWorkspace = organizationCount > 1

  useEffect(() => setName(organization.name), [organization.name])

  return (
    <ManagerPageFrame>
      <ManagerPanel>
        <ManagerPageHeader
          eyebrow={organization.name}
          title={t('Workspace settings')}
          description={t('Manage this workspace without affecting your other workspaces.')}
        />
      </ManagerPanel>

      <ManagerPanel>
        <ManagerContentHeader
          title={t('Workspace details')}
          description={t('Update the workspace identity and control access to it.')}
        />
        <div className="flex flex-col gap-5 bg-white p-5 sm:p-7">
          <section className="border-b border-gray-200 pb-5">
            <h2 className="font-black text-gray-950">{t('Workspace name')}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              {t('The name appears in the workspace switcher and invitations.')}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                className="min-w-0 flex-1"
                invalid={
                  (touched.name && name.trim().length < 2) ||
                  hasFieldError(errorMessage, 'organization')
                }
                valid={touched.name && name.trim().length >= 2}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  onChange?.()
                }}
                disabled={!isOwner || pending}
                onBlur={() => touch('name')}
              />
              <Button
                disabled={!isOwner || pending || name.trim().length < 2 || name.trim() === organization.name}
                onClick={() => onRename(name.trim())}
              >
                {t('Save name')}
              </Button>
            </div>
            {!isOwner && (
              <p className="mt-3 text-xs font-bold text-gray-400">{t('Only owners can rename a workspace.')}</p>
            )}
          </section>

          <section className="rounded-lg border border-red-200 bg-red-50/40 p-5">
            <h2 className="font-black text-red-900">{t('Workspace access')}</h2>
            <p className="mt-1 text-sm font-semibold text-red-700">
              {t('Leaving removes your access. Deleting removes this workspace, its invitations, and all of its quizzes.')}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={!hasOtherWorkspace || pending}
                onClick={() => setConfirmAction('leave')}
              >
                {t('Leave workspace')}
              </Button>
              {isOwner && (
                <Button
                  variant="danger"
                  disabled={!hasOtherWorkspace || pending}
                  onClick={() => setConfirmAction('delete')}
                >
                  {t('Delete workspace')}
                </Button>
              )}
            </div>
            {!hasOtherWorkspace && (
              <p className="mt-3 text-xs font-bold text-red-700">
                {t('Create or join another workspace before leaving or deleting this one.')}
              </p>
            )}
          </section>
        </div>
      </ManagerPanel>

      <ConfirmDialog
        open={confirmAction === 'leave'}
        title={t('Leave “{workspace}”?', { workspace: organization.name })}
        confirmLabel={t('Leave workspace')}
        danger
        onConfirm={() => {
          setConfirmAction(null)
          onLeave()
        }}
        onCancel={() => setConfirmAction(null)}
      >
        {t('You will lose access to this workspace’s quizzes, members, and games.')}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title={t('Delete “{workspace}”?', { workspace: organization.name })}
        confirmLabel={t('Delete workspace')}
        danger
        onConfirm={() => {
          setConfirmAction(null)
          onDelete()
        }}
        onCancel={() => setConfirmAction(null)}
      >
        {t('This permanently removes the workspace, its invitations, and every quiz it contains.')}
      </ConfirmDialog>
    </ManagerPageFrame>
  )
}
