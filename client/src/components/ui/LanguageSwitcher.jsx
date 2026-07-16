import clsx from 'clsx'
import { useTranslation } from '../../i18n/index.js'

// Compact language picker (native select for accessibility + zero deps). Themed
// for both the dark auth shell and the light manager header via `variant`.
export const LanguageSwitcher = ({ variant = 'dark', className }) => {
  const { t, locale, setLocale, locales } = useTranslation()

  return (
    <label className={clsx('inline-flex items-center', className)}>
      <span className="sr-only">{t('Language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        aria-label={t('Language')}
        className={clsx(
          'cursor-pointer rounded-md border-2 px-2 py-1 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary',
          variant === 'dark'
            ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
        )}
      >
        {locales.map(({ code, label, flag }) => (
          <option key={code} value={code} className="text-gray-800">
            {flag} {label}
          </option>
        ))}
      </select>
    </label>
  )
}
