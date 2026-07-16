import { de } from './de.js'

export const DEFAULT_LOCALE = 'en'

// Add a language by importing its dictionary and adding one entry here.
// English source strings are used as keys, so an empty English dictionary is
// intentional and remains the final readable fallback for every locale.
export const LOCALE_REGISTRY = {
  en: {
    label: 'English',
    flag: '🇬🇧',
    messages: {},
  },
  de: {
    label: 'Deutsch',
    flag: '🇩🇪',
    messages: de,
  },
}

export const LOCALES = Object.entries(LOCALE_REGISTRY).map(([code, { label, flag }]) => ({
  code,
  label,
  flag,
}))

export const isSupportedLocale = (locale) => Object.hasOwn(LOCALE_REGISTRY, locale)

export const getMessages = (locale) =>
  LOCALE_REGISTRY[locale]?.messages ?? LOCALE_REGISTRY[DEFAULT_LOCALE].messages

export const interpolate = (template, vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : template

export const translate = (locale, key, vars) => {
  const localized = getMessages(locale)[key]
  const english = getMessages(DEFAULT_LOCALE)[key]

  return interpolate(localized ?? english ?? key, vars)
}
