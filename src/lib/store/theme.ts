import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AccentPreset {
  name: string
  light: string
  dark: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Vite Purple', light: '#aa3bff', dark: '#c084fc' },
  { name: 'Blue', light: '#3b82f6', dark: '#60a5fa' },
  { name: 'Cyan', light: '#06b6d4', dark: '#22d3ee' },
  { name: 'Emerald', light: '#10b981', dark: '#34d399' },
  { name: 'Amber', light: '#f59e0b', dark: '#fbbf24' },
  { name: 'Rose', light: '#f43f5e', dark: '#fb7185' },
  { name: 'Pink', light: '#ec4899', dark: '#f472b6' },
]

interface ThemeState {
  mode: ThemeMode
  accent: string
  customAccent: string | null
  setMode: (mode: ThemeMode) => void
  setAccent: (name: string) => void
  setCustomAccent: (hex: string) => void
}

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: 'system',
  accent: 'Vite Purple',
  customAccent: null,
  setMode: (mode) => set({ mode }),
  setAccent: (accent) => set({ accent }),
  setCustomAccent: (hex) => set({ customAccent: hex, accent: 'custom' }),
}))

export function resolveAccent(state: ThemeState): { light: string; dark: string } {
  if (state.accent === 'custom' && state.customAccent) {
    return { light: state.customAccent, dark: state.customAccent }
  }
  const preset = ACCENT_PRESETS.find((p) => p.name === state.accent)
  return preset ?? ACCENT_PRESETS[0]
}
