/**
 * Minimal bilingual i18n for Our Free Model standalone console.
 *
 * Design: no external library — mirrors the existing visibilityCopy() pattern
 * in visibility-data.mjs. Locale is stored in document.documentElement.lang
 * and localStorage so both the React tree and the legacy .mjs files stay in sync.
 */

import { useCallback, useEffect, useState } from 'react'
import { en } from './en'
import { zh } from './zh'

export type Locale = 'en' | 'zh'
export type TranslationKey = keyof typeof zh
export type TranslationDict = Record<TranslationKey, string>

const STORAGE_KEY = 'ofm-locale'
const EVENT_NAME = 'ofm:locale-changed'

export function getLocale(): Locale {
  const docLang = document.documentElement.lang?.toLowerCase() ?? ''
  if (docLang.startsWith('en')) return 'en'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en') return 'en'
  } catch { /* storage unavailable */ }
  return 'zh'
}

export function setLocale(locale: Locale): void {
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { locale } }))
}

/** Returns the translation dictionary for the current locale. */
export function getDict(): TranslationDict {
  return getLocale() === 'en' ? (en as unknown as TranslationDict) : (zh as unknown as TranslationDict)
}

/** React hook — re-renders whenever the locale changes. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>(getLocale)
  useEffect(() => {
    const handler = (event: Event) => {
      setLocaleState((event as CustomEvent<{ locale: Locale }>).detail.locale)
    }
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])
  const change = useCallback((next: Locale) => {
    setLocale(next)
    setLocaleState(next)
  }, [])
  return [locale, change]
}

/** React hook — returns a translation function bound to the current locale. */
export function useT(): (key: TranslationKey) => string {
  const [locale] = useLocale()
  const dict: TranslationDict = locale === 'en' ? (en as unknown as TranslationDict) : (zh as unknown as TranslationDict)
  const defaultDict: TranslationDict = zh as unknown as TranslationDict
  return (key: TranslationKey) => dict[key] ?? defaultDict[key] ?? key
}
