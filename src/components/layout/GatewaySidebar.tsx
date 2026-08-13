import { NavLink } from 'react-router'
import { Settings } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/gateway', labelKey: 'gateway.configuration', icon: Settings },
] as const

export function GatewaySidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-border bg-sidebar transition-[opacity] duration-200',
        collapsed && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <span className="text-sm font-medium text-sidebar-foreground">
          {t('nav.gateway')}
        </span>
      </div>
      <nav className="flex-1 p-2">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/gateway'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
