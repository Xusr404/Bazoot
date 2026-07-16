import clsx from 'clsx'

// Variants cover every button style used across the app so screens never
// hand-roll button colours: primary (brand orange), secondary (white + grey
// outline), outline (orange outline — lighter brand emphasis), danger
// (destructive red).
const VARIANTS = {
  primary: 'bg-primary text-white',
  secondary: 'bg-white text-black outline outline-gray-300',
  outline: 'bg-white text-primary outline outline-2 outline-primary',
  danger: 'bg-red-500 text-white',
}

export const Button = ({ children, className, variant = 'primary', ...otherProps }) => (
  <button
    className={clsx(
      'btn-shadow rounded-md p-2 text-lg font-semibold',
      'disabled:pointer-events-none disabled:opacity-60',
      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      VARIANTS[variant],
      className,
    )}
    {...otherProps}
  >
    {/* The `.btn-shadow span` rule (app.css) lays this out as a centered flex
        row, so an icon child sits inline with the label instead of stacking
        (Preflight makes <svg> display:block). */}
    <span>{children}</span>
  </button>
)
