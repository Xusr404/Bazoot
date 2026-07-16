import clsx from 'clsx'

const parseFinite = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const decimalPlaces = (value) => {
  const text = String(value)
  return text.includes('.') ? text.split('.')[1].length : 0
}

const formatSteppedValue = (value, step) => {
  const places = decimalPlaces(step)
  return places > 0 ? value.toFixed(places) : String(Math.round(value))
}

const clamp = (value, min, max) => {
  const minValue = parseFinite(min)
  const maxValue = parseFinite(max)

  if (minValue !== null && value < minValue) return minValue
  if (maxValue !== null && value > maxValue) return maxValue

  return value
}

const emitNumericChange = (onChange, value, event) => {
  if (!onChange) return

  onChange({
    ...event,
    target: { ...event?.target, value },
    currentTarget: { ...event?.currentTarget, value },
  })
}

const nextValue = ({ value, min, max, step = 1, direction }) => {
  const stepValue = parseFinite(step) ?? 1
  const minValue = parseFinite(min)
  const maxValue = parseFinite(max)
  const currentValue = parseFinite(value)
  const fallback = direction > 0 ? (minValue ?? 0) : (maxValue ?? minValue ?? 0)
  const next = clamp((currentValue ?? fallback) + stepValue * direction, min, max)

  return formatSteppedValue(next, stepValue)
}

export const NumericInput = ({
  className,
  invalid = false,
  valid = false,
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  id,
  name,
  ...otherProps
}) => {
  const numericValue = parseFinite(value)
  const minValue = parseFinite(min)
  const maxValue = parseFinite(max)
  const canStepDown = !disabled && !readOnly && (numericValue === null || minValue === null || numericValue > minValue)
  const canStepUp = !disabled && !readOnly && (numericValue === null || maxValue === null || numericValue < maxValue)

  const stepBy = (direction, event) => {
    if ((direction < 0 && !canStepDown) || (direction > 0 && !canStepUp)) {
      return
    }

    emitNumericChange(
      onChange,
      nextValue({ value, min, max, step, direction }),
      event,
    )
  }

  return (
    <div
      className={clsx(
        'flex h-11 min-w-0 items-center overflow-hidden rounded-md bg-white text-gray-950 outline outline-2 transition',
        invalid
          ? 'outline-red-400 focus-within:outline-red-500'
          : valid
            ? 'outline-green-500 focus-within:outline-green-600'
            : 'outline-gray-300 focus-within:outline-primary',
        disabled && 'opacity-60',
        className,
      )}
    >
      {/* Keep the input first in DOM order. Field wraps this control in a
          label, so label/hint clicks must focus the value—not trigger minus. */}
      <input
        id={id}
        name={name}
        type="text"
        inputMode={String(step).includes('.') ? 'decimal' : 'numeric'}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        role="spinbutton"
        aria-invalid={invalid || undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={numericValue ?? undefined}
        className="order-2 h-full min-w-0 flex-1 bg-transparent px-2 text-center text-lg font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            stepBy(-1, event)
            return
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            stepBy(1, event)
          }
        }}
        {...otherProps}
      />

      <button
        type="button"
        className="order-1 flex h-full w-10 shrink-0 items-center justify-center border-r border-gray-200 bg-gray-50/70 text-xl font-black text-gray-500 transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:bg-gray-50 disabled:text-gray-300"
        onClick={(event) => stepBy(-1, event)}
        disabled={!canStepDown}
        aria-label="Decrease value"
        tabIndex={disabled ? -1 : 0}
      >
        -
      </button>

      <button
        type="button"
        className="order-3 flex h-full w-10 shrink-0 items-center justify-center border-l border-gray-200 bg-gray-50/70 text-xl font-black text-gray-500 transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:bg-gray-50 disabled:text-gray-300"
        onClick={(event) => stepBy(1, event)}
        disabled={!canStepUp}
        aria-label="Increase value"
        tabIndex={disabled ? -1 : 0}
      >
        +
      </button>
    </div>
  )
}
