import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from '../../i18n/index.js'
import { Button } from './Button.jsx'
import { Card } from './Card.jsx'

// Workspace-picker modal for copy/move quiz operations.
// `mode` is 'copy' | 'move'; `organizations` excludes the current workspace.
export const TransferQuizDialog = ({
  open,
  mode = 'copy',
  quizSubject,
  organizations,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation()
  const titleId = useId()
  const [selectedId, setSelectedId] = useState(null)

  // Reset selection whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedId(organizations.length === 1 ? organizations[0].id : null)
    }
  }, [open, organizations])

  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    restoreFocusRef.current = document.activeElement

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
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onCancel])

  if (!open) {
    return null
  }

  const title = mode === 'move' ? t('Move to workspace') : t('Copy to workspace')
  const confirmLabel = mode === 'move' ? t('Move') : t('Copy')

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-show flex w-full max-w-sm flex-col gap-4 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          {quizSubject && (
            <p className="mt-0.5 truncate text-sm font-semibold text-gray-500" title={quizSubject}>
              {quizSubject}
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {organizations.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                onClick={() => setSelectedId(org.id)}
                className={clsx(
                  'w-full rounded-lg border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors',
                  selectedId === org.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                {org.name}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          <Button
            className="flex-1"
            disabled={!selectedId}
            onClick={() => selectedId && onConfirm(selectedId)}
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
