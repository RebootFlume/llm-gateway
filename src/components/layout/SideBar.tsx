import { useLocation } from 'react-router'
import { sectionKey, sectionLabelKey } from '@/lib/nav'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ProvidersSidebar } from './ProvidersSidebar'
import { GatewaySidebar } from './GatewaySidebar'
import { ChatSidebar } from './ChatSidebar'
import { CallLogsSidebar } from './CallLogsSidebar'

export function SideBar({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  const location = useLocation()
  const section = sectionKey(location.pathname)
  const labelKey = sectionLabelKey(section)

  if (section === 'chat') {
    return <ChatSidebar collapsed={collapsed} />
  }
  if (section === 'models') {
    return <ProvidersSidebar collapsed={collapsed} />
  }
  if (section === 'gateway') {
    return <GatewaySidebar collapsed={collapsed} />
  }
  if (section === 'logs') {
    return <CallLogsSidebar collapsed={collapsed} />
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-border bg-sidebar transition-[opacity] duration-200',
        collapsed && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium text-sidebar-foreground">
          {labelKey ? t(labelKey) : t('nav.explorer')}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          <p className="px-2 py-4 text-xs text-muted-foreground">—</p>
        </div>
      </ScrollArea>
    </div>
  )
}
