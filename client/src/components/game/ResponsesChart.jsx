import clsx from 'clsx'
import { answerColourClasses } from '../../tokens/index.js'

// Manager reveal bar chart: one column per answer, bar height = vote share,
// count label strip at the bottom of each bar (source Responses markup).
export const ResponsesChart = ({ answers, responses, percentages }) => (
  <div
    className="mt-8 grid h-40 w-full max-w-3xl gap-4 px-2"
    style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}
  >
    {answers.map((_, key) => (
      <div
        key={key}
        className={clsx(
          'flex flex-col justify-end self-end overflow-hidden rounded-md',
          answerColourClasses[key],
        )}
        style={{ height: percentages[key] }}
      >
        <span className="w-full bg-black/10 text-center text-lg font-bold text-white drop-shadow-md">
          {responses[key] || 0}
        </span>
      </div>
    ))}
  </div>
)
