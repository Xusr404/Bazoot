import clsx from 'clsx'

// White surface card — the app's standard container (auth forms, quiz list,
// wizard panels). Padding is set by the caller so nested cards can vary.
export const Card = ({ className, children, ...otherProps }) => (
  <div className={clsx('rounded-md bg-white shadow-sm', className)} {...otherProps}>
    {children}
  </div>
)
