import clsx from 'clsx'
import { useTranslation } from '../../i18n/index.js'

// Labelled form row: label (+ required mark / optional tag / counter), the
// control itself, an optional hint, and the field's validation error. Keeps
// every form in the app aligned on the same spacing and error placement.
export const Field = ({
  label,
  required = false,
  optional = false,
  hint,
  error,
  counter,
  className,
  children,
}) => {
  const { t } = useTranslation()

  return (
    <label className={clsx('flex min-w-0 flex-col gap-1', className)}>
      <span className="flex items-baseline justify-between gap-2 text-sm font-bold text-gray-800">
        <span>
          {typeof label === 'string' ? t(label) : label}
          {required && <span className="text-primary ml-0.5">*</span>}
          {optional && <span className="ml-1.5 text-xs font-semibold text-gray-400">{t('optional')}</span>}
        </span>
        {counter && <span className="shrink-0 text-xs font-semibold text-gray-400">{counter}</span>}
      </span>

      {children}

      {hint && !error && <span className="text-xs font-semibold text-gray-500">{typeof hint === 'string' ? t(hint) : hint}</span>}
      {error && (
        <span role="alert" className="text-sm font-semibold text-red-600">
          {typeof error === 'string' ? t(error) : error}
        </span>
      )}
    </label>
  )
}
