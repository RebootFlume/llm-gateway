import { useEffect } from 'react'
import { useThemeStore } from '@/lib/store/theme'
import { applyTheme } from '@/lib/theme-apply'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((s) => s.mode)
  const accent = useThemeStore((s) => s.accent)
  const customAccent = useThemeStore((s) => s.customAccent)

  useEffect(() => {
    applyTheme()
  }, [mode, accent, customAccent])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  return <>{children}</>
}
