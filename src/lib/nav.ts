import {
  MessageSquareText,
  Boxes,
  Zap,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'

export interface ActivityItem {
  to: string
  labelKey: MessageKey
  icon: LucideIcon
}

export const ACTIVITY_ITEMS: ActivityItem[] = [
  { to: '/chat', labelKey: 'nav.chat', icon: MessageSquareText },
  { to: '/models', labelKey: 'nav.models', icon: Boxes },
  { to: '/gateway', labelKey: 'nav.gateway', icon: Zap },
]

export const LOGS_ITEM: ActivityItem = {
  to: '/logs',
  labelKey: 'nav.logs',
  icon: ScrollText,
}

export const SETTINGS_ITEM: ActivityItem = {
  to: '/settings',
  labelKey: 'nav.settings',
  icon: Settings,
}

export type SectionKey =
  | 'chat'
  | 'models'
  | 'gateway'
  | 'logs'
  | 'settings'
  | ''

export function sectionKey(pathname: string): SectionKey {
  if (pathname === '/chat' || pathname.startsWith('/chat')) return 'chat'
  if (pathname === '/models' || pathname.startsWith('/models')) return 'models'
  if (pathname === '/gateway' || pathname.startsWith('/gateway')) return 'gateway'
  if (pathname === '/logs' || pathname.startsWith('/logs')) return 'logs'
  if (pathname === '/settings' || pathname.startsWith('/settings')) return 'settings'
  return ''
}

const SECTION_KEYS: Record<Exclude<SectionKey, ''>, MessageKey> = {
  chat: 'nav.chat',
  models: 'nav.models',
  gateway: 'nav.gateway',
  logs: 'nav.logs',
  settings: 'nav.settings',
}

export function sectionLabelKey(section: SectionKey): MessageKey | null {
  return section ? SECTION_KEYS[section] : null
}
