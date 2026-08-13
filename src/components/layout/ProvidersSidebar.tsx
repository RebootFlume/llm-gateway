import { NavLink } from 'react-router'
import { ChevronRight, Globe, Server, Trash2 } from 'lucide-react'
import { useProvidersStore } from '@/lib/store/providers'
import type { Provider } from '@/lib/providers'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AddProviderDialog } from '@/components/AddProviderDialog'

const STATUS_DOT: Record<Provider['status'], string> = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-muted-foreground/40',
  testing: 'bg-amber-500 animate-pulse',
  failed: 'bg-red-500',
}

function ProviderLink({ provider }: { provider: Provider }) {
  const { t } = useI18n()
  const removeProvider = useProvidersStore((s) => s.removeProvider)
  const Icon = provider.adapter === 'openai-compatible' ? Globe : Server
  return (
    <NavLink
      to={`/models/${provider.id}`}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-sm transition-colors',
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          !provider.enabled && 'opacity-50',
        )
      }
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[provider.status])}
        title={provider.status}
      />
      <Icon className="size-4 shrink-0 text-muted-foreground/70" />
      <span className="flex-1 truncate">{provider.name}</span>
      {provider.custom && (
        <button
          type="button"
          aria-label={t('sidebar.removeProvider', { name: provider.name })}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            removeProvider(provider.id)
          }}
          className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </NavLink>
  )
}

function Group({
  title,
  items,
}: {
  title: string
  items: Provider[]
}) {
  if (items.length === 0) return null
  return (
    <Collapsible defaultOpen className="group/tree">
      <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]/tree:rotate-90" />
        <span className="uppercase tracking-wide">{title}</span>
        <span className="ml-auto text-muted-foreground/60">{items.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 border-l border-border">
          {items.map((p) => (
            <ProviderLink key={p.id} provider={p} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ProvidersSidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  const providers = useProvidersStore((s) => s.providers)
  const defaults = providers.filter((p) => !p.custom)
  const custom = providers.filter((p) => p.custom)

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-border bg-sidebar transition-[opacity] duration-200',
        collapsed && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium text-sidebar-foreground">
          {t('sidebar.providers')}
        </span>
        <AddProviderDialog />
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          <Group title={t('sidebar.default')} items={defaults} />
          <Group title={t('sidebar.custom')} items={custom} />
          {custom.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t('sidebar.noCustomProviders')}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
