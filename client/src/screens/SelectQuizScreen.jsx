import { EVENTS } from '@bazoot/shared/events'
import clsx from 'clsx'
import { useState } from 'react'
import {
  ClockIcon,
  CopyIcon,
  DocumentIcon,
  DotsVerticalIcon,
  LightbulbIcon,
  ListIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  ArrowRightIcon,
} from '../components/icons/ui.jsx'
import {
  ManagerContentHeader,
  ManagerEmptyState,
  ManagerPageFrame,
  ManagerPageHeader,
  ManagerPanel,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Callout } from '../components/ui/Callout.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Menu } from '../components/ui/Menu.jsx'
import { Tag } from '../components/ui/Tag.jsx'
import { TransferQuizDialog } from '../components/ui/TransferQuizDialog.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSocketEvent } from '../hooks/useSocket.js'
import { TYPE_META } from './quizWizard/questionTypeMeta.js'
import { draftStats, formatDuration } from './quizWizard/quizDraft.js'

// Quiz library after manager auth: each quiz hosts directly (no select-then-
// submit), with edit and a protected delete behind a per-quiz overflow menu.
// Account actions live in the page header (AccountMenu), not this screen.
export const SelectQuizScreen = ({
  quizzList,
  workspaceName,
  organizations,
  currentOrganizationId,
  onEdit,
  onCreate,
}) => {
  const { createGame, deleteQuizz, copyQuizz, moveQuizz } = useGame()
  const { t } = useTranslation()
  // One hosting request at a time — a second click while the server is
  // creating the room would open two lobbies.
  const [hostingId, setHostingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [transferDialog, setTransferDialog] = useState(null) // { quizz, mode: 'copy'|'move' }

  // Other workspaces the user belongs to (excluding the current one).
  const otherOrganizations = (organizations ?? []).filter((o) => o.id !== currentOrganizationId)

  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, () => setHostingId(null))
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, () => setHostingId(null))

  const handleHost = (quizz) => {
    if (hostingId) {
      return
    }

    setHostingId(quizz.id)
    createGame(quizz.id)
  }

  const hasQuizzes = quizzList.length > 0

  return (
    <ManagerPageFrame>
      <ManagerPanel>
        <ManagerPageHeader
          eyebrow={workspaceName}
          title={t('Workspace quizzes')}
          description={t('Create, host and manage quizzes for {workspace}.', { workspace: workspaceName })}
          actions={<Button
            className="flex h-11 w-full items-center justify-center gap-1.5 px-5 sm:w-auto"
            onClick={onCreate}
          >
            <PlusIcon className="h-5 w-5" />
            {t('New quiz')}
          </Button>}
        />
      </ManagerPanel>

      <ManagerPanel>
        <ManagerContentHeader
          title={t('Quiz library')}
          description={
            hasQuizzes
              ? t(
                  quizzList.length === 1
                    ? '{count} quiz ready to edit or host.'
                    : '{count} quizzes ready to edit or host.',
                  { count: quizzList.length },
                )
              : t('Create your first quiz to start building your library.')
          }
        />
        <div className="flex flex-col gap-5 p-5 sm:p-7">
        {hasQuizzes ? (
          <ul className="flex flex-col gap-2.5">
            {quizzList.map((quizz) => {
              const stats = draftStats(quizz)

              return (
                <li
                  key={quizz.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3.5 transition-colors hover:border-gray-300 hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-primary/10 text-primary hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex"
                    >
                      <DocumentIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-900" title={quizz.subject}>
                        {quizz.subject}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <ListIcon className="h-3.5 w-3.5" />
                          {t(
                            stats.questionCount === 1 ? '{count} question' : '{count} questions',
                            { count: stats.questionCount },
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {formatDuration(stats.estimatedSeconds)}
                        </span>
                      </div>
                      {Object.keys(stats.typeCounts).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(stats.typeCounts).map(([type, count]) => (
                            <Tag key={type}>
                              {count}× {TYPE_META[type]?.short ?? type}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 pt-3 sm:border-t-0 sm:pt-0">
                    <Button
                      variant="outline"
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 px-3.5 text-sm sm:flex-none"
                      onClick={() => handleHost(quizz)}
                      disabled={Boolean(hostingId)}
                      aria-label={t('Host {subject}', { subject: quizz.subject })}
                      title={t('Open a live lobby with a game PIN')}
                    >
                      <PlayIcon className="h-4 w-4" />
                      {hostingId === quizz.id ? t('Opening…') : t('Host')}
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 px-3.5 text-sm sm:flex-none"
                      onClick={() => onEdit(quizz)}
                      aria-label={t('Edit {subject}', { subject: quizz.subject })}
                    >
                      <PencilIcon className="h-4 w-4" />
                      {t('Edit')}
                    </Button>
                    <Menu
                      align="right"
                      menuLabel={t('Actions for {subject}', { subject: quizz.subject })}
                      items={[
                        ...(otherOrganizations.length > 0
                          ? [
                              {
                                label: t('Copy to workspace…'),
                                icon: <CopyIcon className="h-4 w-4" />,
                                onSelect: () => setTransferDialog({ quizz, mode: 'copy' }),
                              },
                              {
                                label: t('Move to workspace…'),
                                icon: <ArrowRightIcon className="h-4 w-4" />,
                                onSelect: () => setTransferDialog({ quizz, mode: 'move' }),
                              },
                            ]
                          : []),
                        {
                          label: t('Delete quiz'),
                          icon: <TrashIcon className="h-4 w-4" />,
                          danger: true,
                          onSelect: () => setConfirmDelete(quizz),
                        },
                      ]}
                      renderTrigger={({ open, triggerProps }) => (
                        <button
                          {...triggerProps}
                          type="button"
                          aria-label={t('Open actions for {subject}', { subject: quizz.subject })}
                          className={clsx(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 transition-colors',
                            'hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                            open && 'bg-gray-100 text-gray-700',
                          )}
                        >
                          <DotsVerticalIcon className="h-5 w-5" />
                        </button>
                      )}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <ManagerEmptyState
            className="rounded-xl border-2 border-dashed border-gray-300"
            icon={<DocumentIcon className="h-6 w-6" />}
            title={t('No quizzes yet')}
            description={t(
              'Create your first quiz — it takes about two minutes, and you can test it before anyone joins.',
            )}
            action={<Button
              className="mt-1 flex h-11 items-center justify-center gap-1.5 px-5"
              onClick={onCreate}
            >
              <PlusIcon className="h-5 w-5" />
              {t('New quiz')}
            </Button>}
          />
        )}

        {hasQuizzes && (
          <Callout tone="info" className="flex items-start gap-2">
            <LightbulbIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>{t('Tip:')}</b>{' '}
              {t('Host a quiz to play it live — players join from their phones with the game PIN.')}
            </span>
          </Callout>
        )}
        </div>
      </ManagerPanel>

      <footer className="px-2 text-center text-xs font-semibold text-white/45">
        {t('Bazoot! — host live quizzes with your group.')}
      </footer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t('Delete “{subject}”?', { subject: confirmDelete?.subject })}
        confirmLabel={t('Delete quiz')}
        danger
        onConfirm={() => {
          deleteQuizz(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        {t(
          'This action cannot be undone. The quiz and its questions will be permanently removed. Games already running are not affected.',
        )}
      </ConfirmDialog>

      <TransferQuizDialog
        open={Boolean(transferDialog)}
        mode={transferDialog?.mode}
        quizSubject={transferDialog?.quizz?.subject}
        organizations={otherOrganizations}
        onConfirm={(targetOrganizationId) => {
          if (transferDialog?.mode === 'move') {
            moveQuizz(transferDialog.quizz.id, targetOrganizationId)
          } else {
            copyQuizz(transferDialog.quizz.id, targetOrganizationId)
          }

          setTransferDialog(null)
        }}
        onCancel={() => setTransferDialog(null)}
      />
    </ManagerPageFrame>
  )
}
