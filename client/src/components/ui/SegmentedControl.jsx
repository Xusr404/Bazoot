import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from '../icons/ui.jsx'

const DEFAULT_OPTION_MIN_WIDTH = '9rem'
const LAYOUTS = new Set(['row', 'grid'])
const VARIANTS = new Set(['inline', 'dropdown'])

const previousKeys = new Set(['ArrowLeft', 'ArrowUp'])
const nextKeys = new Set(['ArrowRight', 'ArrowDown'])

const normalizeLayout = (layout) => (LAYOUTS.has(layout) ? layout : 'row')
const normalizeVariant = (variant) => (VARIANTS.has(variant) ? variant : 'inline')
const optionKey = (value) => String(value)

const nextEnabledIndex = (options, startIndex, step) => {
  if (!options.length) {
    return -1
  }

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + step * offset + options.length) % options.length

    if (!options[index]?.disabled) {
      return index
    }
  }

  return -1
}

const firstEnabledIndex = (options) => options.findIndex((option) => !option.disabled)

const lastEnabledIndex = (options) => {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index
    }
  }

  return -1
}

const SegmentedOptions = ({
  options,
  value,
  groupId,
  groupLabel,
  ariaLabelledBy,
  layout,
  optionMinWidth,
  optionRefs,
  tabIndex,
  onChoose,
  onNavigate,
  className,
  embedded = false,
}) => (
  <div
    role="radiogroup"
    aria-label={groupLabel}
    aria-labelledby={ariaLabelledBy}
    onKeyDown={onNavigate}
    className={clsx(
      embedded
        ? 'overflow-hidden rounded-md bg-gray-200 focus-within:ring-2 focus-within:ring-primary/40'
        : 'overflow-auto rounded-md border border-gray-300 bg-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2',
      className,
    )}
  >
    <div
      className={clsx(
        'gap-px',
        layout === 'row'
          ? 'flex min-w-full'
          : 'grid min-w-full grid-cols-[repeat(auto-fit,minmax(min(100%,var(--segmented-option-min)),1fr))]',
      )}
      style={{ '--segmented-option-min': optionMinWidth }}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const optionId = `${groupId}-option-${index}`

        return (
          <button
            key={optionKey(option.value)}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            id={optionId}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            tabIndex={index === tabIndex ? 0 : -1}
            onClick={() => onChoose(index, { close: true })}
            className={clsx(
              'relative flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-center text-sm font-bold leading-tight transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              layout === 'row' && 'min-w-[var(--segmented-option-min)] flex-1',
              selected
                ? '-m-px z-10 bg-primary text-white shadow-inset outline outline-1 outline-primary'
                : 'bg-white text-gray-700 hover:bg-gray-50',
              option.disabled &&
                (selected
                  ? 'bg-primary/60 text-white/80 outline-primary/50'
                  : 'text-gray-300 hover:bg-white'),
            )}
          >
            {option.icon && (
              <span
                aria-hidden
                className={clsx(
                  'shrink-0',
                  selected ? 'text-white' : option.disabled ? 'text-gray-300' : 'text-gray-400',
                )}
              >
                {option.icon}
              </span>
            )}

            <span
              className={clsx(
                'min-w-0 break-words',
                option.description ? 'text-left' : 'text-center',
              )}
            >
              <span className="block">{option.label}</span>
              {option.description && (
                <span
                  className={clsx(
                    'mt-0.5 block text-xs leading-tight font-semibold',
                    selected
                      ? 'text-white/85'
                      : option.disabled
                        ? 'text-gray-300'
                        : 'text-gray-400',
                  )}
                >
                  {option.description}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  </div>
)

// Connected radio-style option group. Inline mode renders the group directly.
// Dropdown mode renders a compact field first, then shows the same connected
// row/grid group in the expanded panel.
export const SegmentedControl = ({
  options,
  value,
  onChange,
  layout = 'row',
  variant = 'inline',
  ariaLabel,
  ariaLabelledBy,
  className,
  optionMinWidth = DEFAULT_OPTION_MIN_WIDTH,
  placeholder = 'Select an option',
}) => {
  const normalizedLayout = normalizeLayout(layout)
  const normalizedVariant = normalizeVariant(variant)
  const isDropdown = normalizedVariant === 'dropdown'
  const groupId = useId()
  const popupId = `${groupId}-popup`
  const optionRefs = useRef([])
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null
  const selectedEnabledIndex = options[selectedIndex]?.disabled ? -1 : selectedIndex
  const fallbackFocusIndex = firstEnabledIndex(options)
  const tabIndex = selectedEnabledIndex >= 0 ? selectedEnabledIndex : fallbackFocusIndex
  const groupLabel = ariaLabel ?? (ariaLabelledBy ? undefined : 'Options')

  const focusOption = (index = tabIndex) => {
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0)
  }

  const closeDropdown = (returnFocus = false) => {
    setOpen(false)

    if (returnFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    }
  }

  const openDropdown = (focusSelected = false) => {
    setOpen(true)

    if (focusSelected) {
      focusOption()
    }
  }

  const chooseIndex = (index, { close = false } = {}) => {
    const option = options[index]

    if (!option || option.disabled) {
      optionRefs.current[index]?.focus()
      return
    }

    if (option.value !== value) {
      onChange?.(option.value)
    }

    if (isDropdown && close) {
      closeDropdown(true)
      return
    }

    focusOption(index)
  }

  const handleOptionsKeyDown = (event) => {
    if (isDropdown && event.key === 'Escape') {
      event.preventDefault()
      closeDropdown(true)
      return
    }

    if (isDropdown && event.key === 'Tab') {
      setOpen(false)
      return
    }

    if (
      !previousKeys.has(event.key) &&
      !nextKeys.has(event.key) &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }

    const focusedIndex = optionRefs.current.findIndex((element) => element === document.activeElement)
    const baseIndex = focusedIndex >= 0 ? focusedIndex : tabIndex
    let targetIndex = -1

    if (previousKeys.has(event.key)) {
      targetIndex = nextEnabledIndex(options, baseIndex, -1)
    } else if (nextKeys.has(event.key)) {
      targetIndex = nextEnabledIndex(options, baseIndex, 1)
    } else if (event.key === 'Home') {
      targetIndex = firstEnabledIndex(options)
    } else if (event.key === 'End') {
      targetIndex = lastEnabledIndex(options)
    }

    if (targetIndex >= 0) {
      event.preventDefault()
      chooseIndex(targetIndex, { close: false })
    }
  }

  useEffect(() => {
    if (!isDropdown || !open) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [isDropdown, open])

  if (!isDropdown) {
    return (
      <SegmentedOptions
        options={options}
        value={value}
        groupId={groupId}
        groupLabel={groupLabel}
        ariaLabelledBy={ariaLabelledBy}
        layout={normalizedLayout}
        optionMinWidth={optionMinWidth}
        optionRefs={optionRefs}
        tabIndex={tabIndex}
        onChoose={chooseIndex}
        onNavigate={handleOptionsKeyDown}
        className={className}
      />
    )
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        className="flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-left shadow-sm transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        onClick={() => (open ? closeDropdown(false) : openDropdown(false))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openDropdown(true)
          } else if (event.key === 'Escape') {
            closeDropdown(false)
          }
        }}
      >
        {selectedOption?.icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            {selectedOption.icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate text-sm font-black', selectedOption ? 'text-gray-900' : 'text-gray-400')}>
            {selectedOption?.label ?? placeholder}
          </span>
          {selectedOption?.description && (
            <span className="mt-0.5 block truncate text-xs font-semibold text-gray-400">
              {selectedOption.description}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          id={popupId}
          className="absolute z-40 mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-200 shadow-xl"
        >
          <SegmentedOptions
            options={options}
            value={value}
            groupId={groupId}
            groupLabel={groupLabel}
            ariaLabelledBy={ariaLabelledBy}
            layout={normalizedLayout}
            optionMinWidth={optionMinWidth}
            optionRefs={optionRefs}
            tabIndex={tabIndex}
            onChoose={chooseIndex}
            onNavigate={handleOptionsKeyDown}
            embedded
          />
        </div>
      )}
    </div>
  )
}
