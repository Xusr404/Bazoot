import clsx from 'clsx'
import { useTranslation } from '../../i18n/index.js'

const TONES = {
  info: 'border-blue-300 bg-blue-50 text-blue-900',
  success: 'border-green-300 bg-green-50 text-green-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
}

// Inline alert block (info / success / warning / error) for form-level
// messages: validation summaries, draft notices, demo hints.
export const Callout = ({ tone = 'info', title, className, children }) => {
  const { t } = useTranslation()

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx('rounded-md border-l-4 px-3 py-2 text-sm font-semibold', TONES[tone], className)}
    >
      {title && <p className="font-bold">{typeof title === 'string' ? t(title) : title}</p>}
      {children}
    </div>
  )
}
