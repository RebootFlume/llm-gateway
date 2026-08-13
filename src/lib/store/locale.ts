import { create } from 'zustand'
import type { Locale } from '@/lib/i18n'

export interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

function detectLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.toLowerCase()
    if (lang.startsWith('zh')) return 'zh'
  }
  return 'en'
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: detectLocale(),
  setLocale: (locale) => set({ locale }),
}))
