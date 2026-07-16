import clsx from 'clsx'

const TONES = {
  neutral: 'bg-gray-100 text-gray-700',
  primary: 'bg-primary/15 text-amber-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
}

// Small status pill for counts and labels (question types, warnings, …).
export const Tag = ({ tone = 'neutral', className, children }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
      TONES[tone],
      className,
    )}
  >
    {children}
  </span>
)
