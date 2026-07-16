import clsx from 'clsx'

// Medal circle styling per rank (1-indexed), exact source classes.
const MEDAL_CLASSES = {
  1: 'border-amber-400 bg-amber-300',
  2: 'border-zinc-400 bg-zinc-500',
  3: 'border-amber-800 bg-amber-700',
}

// Column heights and stacking per rank, exact source classes.
const COLUMN_CLASSES = {
  1: 'z-30 h-[60%]',
  2: 'z-20 h-[50%]',
  3: 'z-10 h-[40%]',
}

// One podium column: rising entrance (translate-y + opacity transition), rank
// medal, points, and the rocking username once the winner is revealed.
export const PodiumColumn = ({ rank, username, avatar, points, visible, celebrate, nameVisible = true, className }) => (
  <div
    className={clsx(
      'flex w-full translate-y-full flex-col items-center gap-3 opacity-0 transition-all',
      COLUMN_CLASSES[rank],
      { 'translate-y-0! opacity-100': visible },
      className,
    )}
  >
    <p
      className={clsx(
        'overflow-visible text-center text-2xl font-bold whitespace-nowrap text-white drop-shadow-lg md:text-4xl',
        { 'anim-balanced': celebrate },
        { 'opacity-0': !nameVisible },
        { 'opacity-100': nameVisible && celebrate },
      )}
    >
      {username}
    </p>
    <div className="bg-primary flex h-full w-full flex-col items-center gap-4 rounded-t-md pt-6 text-center shadow-2xl">
      <p
        className={clsx(
          'flex aspect-square h-14 items-center justify-center rounded-full border-4 text-3xl font-bold text-white drop-shadow-lg',
          MEDAL_CLASSES[rank],
        )}
      >
        <span className="drop-shadow-md">{rank}</span>
      </p>
      {avatar && (
        <span className="text-4xl leading-none drop-shadow-lg md:text-5xl" aria-hidden="true">
          {avatar}
        </span>
      )}
      <p className="text-2xl font-bold text-white drop-shadow-lg">{points}</p>
    </div>
  </div>
)
