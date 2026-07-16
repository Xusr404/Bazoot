import clsx from 'clsx'

// Native select styled like Input so dropdowns match text fields everywhere.
export const Select = ({ className, children, ...otherProps }) => (
  <select
    className={clsx(
      'rounded-sm bg-white p-2 text-lg font-semibold outline-2 outline-gray-300 focus:outline-primary',
      className,
    )}
    {...otherProps}
  >
    {children}
  </select>
)
