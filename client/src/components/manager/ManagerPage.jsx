import clsx from 'clsx'
import { useTranslation } from '../../i18n/index.js'
import { Card } from '../ui/Card.jsx'

export const ManagerPageFrame = ({ className, children }) => (
  <main
    className={clsx(
      'z-10 flex w-[calc(100%-1.5rem)] max-w-[78rem] flex-col gap-4 sm:w-[calc(100%-3rem)]',
      className,
    )}
  >
    {children}
  </main>
)



export const ManagerPanel = ({ className, children, ...props }) => (
  <Card
    className={clsx('overflow-hidden rounded-xl border border-gray-200', className)}
    {...props}
  >
    {children}
  </Card>
)

export const ManagerAuthCard = ({ className, children }) => (
  <Card
    className={clsx(
      'z-10 w-full max-w-sm overflow-hidden rounded-xl border border-gray-200',
      className,
    )}
  >
    {children}
  </Card>
)

export const ManagerAuthHeader = ({ eyebrow, title, description }) => {
  const { t } = useTranslation()

  return (
    <header className="border-b border-gray-200 px-5 py-5 text-left">
      <p className="text-xs font-bold tracking-widest text-primary uppercase">{t(eyebrow)}</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-950">{t(title)}</h1>
      {description && <p className="mt-2 text-sm font-semibold text-gray-500">{t(description)}</p>}
    </header>
  )
}

export const ManagerAuthBody = ({ className, children }) => (
  <div className={clsx('flex flex-col gap-4 p-5', className)}>{children}</div>
)

export const ManagerPageHeader = ({ eyebrow, title, description, actions, children, className }) => {
  const { t } = useTranslation()

  return (
    <header
      className={clsx(
        'flex flex-col gap-4 border-b border-gray-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold tracking-widest text-primary uppercase">{t(eyebrow)}</p>
        )}
        <h1 className="mt-1 text-3xl font-black tracking-tight text-gray-950">{t(title)}</h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm font-semibold text-gray-500">{t(description)}</p>
        )}
        {children}
      </div>
      {actions && <div className="shrink-0 self-start">{actions}</div>}
    </header>
  )
}

export const ManagerContentHeader = ({ title, description, meta, actions, className }) => {
  const { t } = useTranslation()

  return (
    <header
      className={clsx(
        'flex flex-col gap-3 border-b border-orange-100 bg-orange-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-extrabold text-gray-950">{t(title)}</h2>
          {meta}
        </div>
        {description && <p className="mt-0.5 text-xs font-semibold text-gray-600">{t(description)}</p>}
      </div>
      {actions && <div className="shrink-0 self-start sm:self-center">{actions}</div>}
    </header>
  )
}

export const ManagerSectionHeader = ({ icon, title, description, actions, className }) => {
  const { t } = useTranslation()

  return (
    <div className={clsx('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="rounded-lg bg-orange-50 p-2 text-primary">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-sm font-extrabold text-gray-950">{t(title)}</h2>
          {description && <p className="mt-0.5 text-xs font-semibold text-gray-500">{t(description)}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0 self-start">{actions}</div>}
    </div>
  )
}

export const ManagerEmptyState = ({ icon, title, description, action, className }) => {
  const { t } = useTranslation()

  return (
    <div
      className={clsx(
        'flex min-h-40 flex-col items-center justify-center gap-3 px-5 py-10 text-center',
        className,
      )}
    >
      {icon && <span className="rounded-lg bg-orange-50 p-3 text-primary">{icon}</span>}
      <div>
        <p className="text-sm font-extrabold text-gray-700">{t(title)}</p>
        {description && <p className="mt-1 max-w-lg text-xs font-semibold text-gray-500">{t(description)}</p>}
      </div>
      {action}
    </div>
  )
}
