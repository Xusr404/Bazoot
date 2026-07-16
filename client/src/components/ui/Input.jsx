import clsx from 'clsx'
import { NumericInput } from './NumericInput.jsx'

export const Input = ({
  className,
  type = 'text',
  invalid = false,
  valid = false,
  ...otherProps
}) => {
  if (type === 'number') {
    return (
      <NumericInput
        className={className}
        invalid={invalid}
        valid={valid}
        {...otherProps}
      />
    )
  }

  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={clsx(
        'rounded-sm bg-white p-2 text-lg font-semibold outline-2',
        invalid
          ? 'outline-red-400'
          : valid
            ? 'outline-green-500 focus:outline-green-600'
            : 'outline-gray-300 focus:outline-primary',
        className,
      )}
      {...otherProps}
    />
  )
}
