import { useEffect, useId, useRef } from 'react'
import { Button } from './Button.jsx'
import { Card } from './Card.jsx'

// Modal confirmation for destructive or hard-to-undo actions — replaces
// window.confirm so dialogs match the app theme. Escape or clicking the
// backdrop cancels; focus is trapped while open and restored to the trigger
// on close. Destructive dialogs use role="alertdialog".
export const ConfirmDialog = ({
  open,
  title,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  extraAction = null,
  wide = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const titleId = useId()
  const bodyId = useId()
  const actionsRef = useRef(null)
  const restoreFocusRef = useRef(null)

  // On open: remember what had focus and move focus into the dialog. On close:
  // hand focus back to the trigger if it is still in the document.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    restoreFocusRef.current = document.activeElement
    actionsRef.current?.querySelector('button')?.focus()

    return () => {
      const previous = restoreFocusRef.current

      if (previous && document.contains(previous) && typeof previous.focus === 'function') {
        previous.focus()
      }
    }
  }, [open])

  // Escape to cancel, Tab to cycle focus between the two actions (focus trap).
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()

        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const buttons = actionsRef.current?.querySelectorAll('button')

      if (!buttons || buttons.length === 0) {
        return
      }

      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (active !== first && active !== last) {
        event.preventDefault()
        first.focus()
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

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <Card
        role={danger ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        className={`anim-show flex w-full flex-col gap-4 p-5 ${wide ? 'max-w-xl' : 'max-w-sm'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="text-sm font-semibold text-gray-600">
            {children}
          </div>
        )}
        <div ref={actionsRef} className="flex gap-3">
          {extraAction && (
            <Button
              variant={extraAction.variant ?? 'primary'}
              className="flex-1 whitespace-nowrap"
              onClick={extraAction.onClick}
              disabled={extraAction.disabled}
            >
              {extraAction.label}
            </Button>
          )}
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1 whitespace-nowrap" onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" className="flex-1 whitespace-nowrap" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}
