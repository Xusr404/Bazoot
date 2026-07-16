import clsx from 'clsx'

// Wizard progress header: numbered circles joined by connector lines.
// Visited steps are clickable; steps with validation problems show a count
// badge once `showErrors` is on. Labels collapse to the active one on mobile.
export const Stepper = ({ steps, currentId, visitedIds, errorCounts = {}, showErrors = false, onStep }) => {
  const currentIndex = steps.findIndex((step) => step.id === currentId)

  return (
    <ol className="flex w-full items-start">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentId
        const isDone = index < currentIndex
        const isVisited = visitedIds.includes(step.id)
        const errors = showErrors ? (errorCounts[step.id] ?? 0) : 0

        return (
          <li key={step.id} className={clsx('flex items-start', index > 0 && 'flex-1')}>
            {index > 0 && (
              <span
                aria-hidden
                className={clsx(
                  'mx-1 mt-4 h-0.5 flex-1 rounded-full sm:mx-2',
                  isDone || isCurrent ? 'bg-primary' : 'bg-gray-200',
                )}
              ></span>
            )}

            <button
              type="button"
              onClick={() => isVisited && onStep(step.id)}
              disabled={!isVisited}
              aria-current={isCurrent ? 'step' : undefined}
              className={clsx(
                'group flex flex-col items-center gap-1',
                !isVisited && 'cursor-default',
              )}
            >
              <span className="relative">
                <span
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                    isCurrent && 'bg-primary shadow-inset text-white',
                    !isCurrent && isDone && 'bg-primary/20 text-amber-800',
                    !isCurrent && !isDone && 'bg-gray-100 text-gray-400',
                    isVisited && !isCurrent && 'group-hover:bg-primary/30',
                  )}
                >
                  {isDone ? '✓' : index + 1}
                </span>
                {errors > 0 && (
                  <span
                    title={`${errors} problem${errors === 1 ? '' : 's'}`}
                    className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                  >
                    {errors}
                  </span>
                )}
              </span>
              <span
                className={clsx(
                  'text-xs font-bold whitespace-nowrap',
                  isCurrent ? 'text-gray-800' : 'text-gray-400',
                  !isCurrent && 'hidden sm:block',
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
