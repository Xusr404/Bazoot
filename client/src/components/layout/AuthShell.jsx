import clsx from 'clsx'
import logo from '../../assets/logo.png'
import { useTranslation } from '../../i18n/index.js'
import { LanguageSwitcher } from '../ui/LanguageSwitcher.jsx'
import { Loader } from '../ui/Loader.jsx'

// Landing/auth backdrop, markup based on the source AuthLayout: secondary page
// background with two translucent primary blobs and the centered logo. An
// optional `headerRight` slot pins page-level controls (e.g. the account menu)
// to the upper-right corner without disturbing the centered content.
export const AuthShell = ({ isConnected, header, headerRight, showLogo = true, children }) => {
  const { t } = useTranslation()

  return (
    <section
      className={clsx(
        'relative flex flex-col items-center',
        header
          ? 'h-dvh overflow-hidden justify-start pt-16'
          : 'min-h-dvh justify-center',
      )}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="bg-primary/15 absolute -top-[15vmin] -left-[15vmin] min-h-[75vmin] min-w-[75vmin] rounded-full"></div>
        <div className="bg-primary/15 absolute -right-[15vmin] -bottom-[15vmin] min-h-[75vmin] min-w-[75vmin] rotate-45"></div>
      </div>

      <div className="absolute top-0 left-0 z-20 p-4 sm:p-5">
        <LanguageSwitcher />
      </div>

      {header}
      {!header && headerRight && (
        <div className="absolute top-0 right-0 z-20 p-4 sm:p-5">{headerRight}</div>
      )}

      {showLogo && <img src={logo} className="mb-8 h-10 sm:mb-10 sm:h-16" alt="Bazoot!" />}

      {isConnected ? (
        header ? (
          <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto py-8">
            {children}
          </div>
        ) : (
          children
        )
      ) : (
        <>
          <Loader className="h-23" />
          <h2 className="mt-2 text-center text-2xl font-bold text-white drop-shadow-lg md:text-3xl">
            {t('Loading...')}
          </h2>
        </>
      )}
    </section>
  )
}
