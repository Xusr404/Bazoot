import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, isSupportedLocale, LOCALES, translate } from './locales.js'

// Lightweight, zero-dependency i18n (project ethos: no heavy deps, named exports).
// Keys ARE the English source strings, so:
//   - English needs no dictionary (t() falls back to the key),
//   - server-sent display strings translate at the render boundary via t(serverString),
//   - a missing translation degrades gracefully to English instead of showing a code.
// Adding a language = one dictionary file + one LOCALE_REGISTRY entry.
const STORAGE_KEY = 'locale'

const detectLocale = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)

    if (stored && isSupportedLocale(stored)) {
      return stored
    }

    const navLocale = navigator.language?.slice(0, 2)

    if (navLocale && isSupportedLocale(navLocale)) {
      return navLocale
    }
  } catch {
    // localStorage/navigator unavailable — fall through to the default.
  }

  return DEFAULT_LOCALE
}

const I18nContext = createContext(null)

export const I18nProvider = ({ children }) => {
  const [locale, setLocaleState] = useState(detectLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next) => {
    if (!isSupportedLocale(next)) {
      return
    }

    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-fatal: language still applies for this session.
    }

    setLocaleState(next)
  }, [])

  /** t('English source', { vars }) → localized string, falling back to the source. */
  const t = useCallback((key, vars) => translate(locale, key, vars), [locale])

  const value = useMemo(
    () => ({ t, locale, setLocale, locales: LOCALES }),
    [t, locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useTranslation = () => {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useTranslation must be used inside an I18nProvider')
  }

  return context
}
