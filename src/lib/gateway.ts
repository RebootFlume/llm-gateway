export interface GatewayConfig {
  port: number
  bindAddress: string
  apiKey: string
}

export const DEFAULT_GATEWAY: GatewayConfig = {
  port: 8080,
  bindAddress: '127.0.0.1',
  apiKey: '',
}

import type { MessageKey } from '@/lib/i18n'

export const BIND_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '127.0.0.1', labelKey: 'gateway.localhostOnly' },
  { value: '0.0.0.0', labelKey: 'gateway.lanAccessible' },
]
