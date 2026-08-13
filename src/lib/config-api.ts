import { invoke } from '@/lib/ipc'
import type { Provider } from '@/lib/providers'
import type { ThemeMode } from '@/lib/store/theme'
import type { GatewayConfig } from '@/lib/gateway'
import type { Locale } from '@/lib/i18n'

export interface ThemeConfig {
  mode: ThemeMode
  accent: string
  customAccent: string | null
}

export interface AppConfig {
  providers?: Provider[]
  theme?: Partial<ThemeConfig>
  gateway?: GatewayConfig
  locale?: Locale
}

export function loadConfig() {
  return invoke<AppConfig | null>('load_config')
}

export function saveConfig(config: AppConfig) {
  return invoke<void>('save_config', { config })
}
