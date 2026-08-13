import { useThemeStore, resolveAccent, type ThemeMode } from '@/lib/store/theme'

export function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function isDark(mode: ThemeMode): boolean {
  return mode === 'system' ? systemDark() : mode === 'dark'
}

function pickForeground(accent: string): string {
  const hex = accent.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.45 ? '#08060d' : '#ffffff'
}

export function applyTheme() {
  const state = useThemeStore.getState()
  const dark = isDark(state.mode)
  const root = document.documentElement
  root.classList.toggle('dark', dark)

  const { light, dark: darkColor } = resolveAccent(state)
  const accent = dark ? darkColor : light
  const fg = pickForeground(accent)
  root.style.setProperty('--primary', accent)
  root.style.setProperty('--primary-foreground', fg)
  root.style.setProperty('--ring', accent)
  root.style.setProperty('--sidebar-primary', accent)
  root.style.setProperty('--sidebar-primary-foreground', fg)
  root.style.setProperty('--sidebar-ring', accent)
  root.style.setProperty('--color-chart-1', accent)
}

export function initTheme() {
  applyTheme()
}
