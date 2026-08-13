import { useLocation, useNavigate } from 'react-router'
import { PanelLeft } from 'lucide-react'
import { ACTIVITY_ITEMS, LOGS_ITEM, SETTINGS_ITEM, type ActivityItem } from '@/lib/nav'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function ActivityButton({
  item,
  onNavigate,
}: {
  item: ActivityItem
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const isActive =
    location.pathname === item.to ||
    location.pathname.startsWith(item.to + '/')
  const label = t(item.labelKey)

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={() => {
          navigate(item.to)
          onNavigate?.()
        }}
        aria-label={label}
        className={cn(
          'group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
        )}
        <item.icon className="size-5" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ActivityBar({
  collapsed,
  onToggleSidebar,
}: {
  collapsed: boolean
  onToggleSidebar: () => void
}) {
  const { t } = useI18n()
  return (
    <aside className="flex flex-col items-center border-r border-border bg-sidebar py-2">
      <div className="flex flex-col gap-1">
        {ACTIVITY_ITEMS.map((item) => (
          <ActivityButton key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <ActivityButton item={LOGS_ITEM} />
        <Tooltip>
          <TooltipTrigger
            onClick={onToggleSidebar}
            aria-label={t('nav.toggleSidebar')}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              !collapsed && 'text-foreground',
            )}
          >
            <PanelLeft className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">{t('nav.toggleSidebar')}</TooltipContent>
        </Tooltip>
        <ActivityButton item={SETTINGS_ITEM} />
      </div>
    </aside>
  )
}
