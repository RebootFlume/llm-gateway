import { useChatStore } from '@/lib/store/chat'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquare, Trash2 } from 'lucide-react'

export function ChatSidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const setActive = useChatStore((s) => s.setActive)
  const deleteConversation = useChatStore((s) => s.deleteConversation)

  function formatDate(ts: number): string {
    const d = new Date(ts)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    if (d.toDateString() === yesterday.toDateString()) return t('sidebar.yesterday')
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-border bg-sidebar transition-[opacity] duration-200',
        collapsed && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <span className="text-sm font-medium text-sidebar-foreground">
          {t('sidebar.conversations')}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {conversations.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {t('sidebar.noConversations')}
          </p>
        ) : (
          <div className="p-1.5">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  c.id === activeId
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => setActive(c.id)}
              >
                <MessageSquare className="size-4 shrink-0 text-muted-foreground/70" />
                <div className="flex-1 truncate">
                  <span className="truncate">{c.title || t('sidebar.newConversation')}</span>
                  <p className="text-[11px] text-muted-foreground/60">
                    {formatDate(c.createdAt)} · {c.model}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t('sidebar.deleteConversation')}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(c.id)
                  }}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
