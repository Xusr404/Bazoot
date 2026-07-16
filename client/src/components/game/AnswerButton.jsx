import clsx from 'clsx'
import { CheckCircleIcon } from '../icons/ui.jsx'

// Coloured answer tile: shape icon + text, inset shadow (source AnswerButton).
// Colour variant comes via className (answerColourClasses token).
// `selected` draws an inner white ring (multi-select), `badge` shows a position
// number chip (ordering questions).
export const AnswerButton = ({
  as: Component = 'button',
  className,
  icon: Icon,
  children,
  selected,
  correct,
  markable,
  badge,
  showCorrectBadge = true,
  showCorrectState = true,
  contentClassName,
  invalid = false,
  ...otherProps
}) => (
  <Component
    className={clsx(
      'shadow-inset flex items-center gap-3 rounded px-4 py-6 text-left transition',
      selected && 'outline-4 -outline-offset-4 outline-white',
      correct && showCorrectState && 'outline-4 -outline-offset-4 outline-white ring-4 ring-green-950/70',
      invalid && 'outline-2 -outline-offset-2 outline-red-400',
      markable && !correct && 'hover:brightness-125 hover:outline-2 hover:outline-white/70',
      className,
    )}
    {...otherProps}
  >
    <Icon className="h-6 w-6" />
    <span className={clsx('min-w-0 drop-shadow-md', contentClassName)}>{children}</span>
    {correct && showCorrectBadge && (
      <span className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-green-700 shadow-lg ring-2 ring-green-950/30" aria-label="Correct answer">
        <CheckCircleIcon className="h-8 w-8" />
      </span>
    )}
    {badge != null && (
      <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-black">
        {badge}
      </span>
    )}
  </Component>
)
