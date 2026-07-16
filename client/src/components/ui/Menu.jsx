import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

// Accessible dropdown menu used for the account menu and per-quiz overflow
// actions. Handles: click/touch outside to close, Escape (restores focus to
// the trigger), roving arrow-key navigation, and ARIA wiring. The trigger is
// supplied via `renderTrigger` so callers keep full control of its styling.
//
// items: array of { label, icon?, onSelect, danger?, disabled? } and { separator: true }.
export const Menu = ({ renderTrigger, items, header, align = 'right', menuLabel }) => {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const itemRefs = useRef([])

  const actions = items.filter((item) => !item.separator)

  const close = (returnFocus) => {
    setOpen(false)

    if (returnFocus) {
      triggerRef.current?.focus()
    }
  }

  // Move browser focus onto the active item while open (roving tabindex).
  useEffect(() => {
    if (open) {
      itemRefs.current[activeIndex]?.focus()
    }
  }, [open, activeIndex])

  // Close on a pointer press anywhere outside the trigger or the popup.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handlePointer = (event) => {
      if (
        !popupRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)

    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [open])

  const openAt = (index) => {
    setActiveIndex(index)
    setOpen(true)
  }

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(actions.length - 1)
    }
  }

  const handleMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % actions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + actions.length) % actions.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(actions.length - 1)
    } else if (event.key === 'Tab') {
      // Let focus leave naturally, but don't leave an orphaned open menu.
      setOpen(false)
    }
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onClick: () => (open ? close(false) : openAt(0)),
    onKeyDown: handleTriggerKeyDown,
  }

  let actionIndex = -1

  return (
    <div className="relative">
      {renderTrigger({ open, triggerProps })}

      {open && (
        <div
          ref={popupRef}
          className={clsx(
            'anim-step absolute top-full z-50 mt-2 min-w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {header && (
            <div className="border-b border-gray-100 px-3 py-2">{header}</div>
          )}

          <div role="menu" aria-label={menuLabel} onKeyDown={handleMenuKeyDown} className="py-1">
            {items.map((item, index) => {
              if (item.separator) {
                return <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-gray-100" />
              }

              actionIndex += 1
              const itemIndex = actionIndex

              return (
                <button
                  key={item.label}
                  ref={(element) => {
                    itemRefs.current[itemIndex] = element
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={activeIndex === itemIndex ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) {
                      return
                    }

                    close(true)
                    item.onSelect?.()
                  }}
                  onMouseEnter={() => setActiveIndex(itemIndex)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus:outline-none',
                    item.disabled
                      ? 'pointer-events-none text-gray-300'
                      : item.danger
                      ? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-100 focus:bg-gray-100',
                  )}
                >
                  {item.icon && (
                    <span className={clsx('shrink-0', !item.danger && 'text-gray-400')}>
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
