import { useEffect } from 'react'
import { ScrollText, Trash2, Zap, MessageSquareText } from 'lucide-react'
import { useCallLogStore } from '@/lib/store/call-log'
import { getCallLogs, clearCallLogs, onCallLog } from '@/lib/call-log-api'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function statusColor(status: number): string {
  if (status >= 500) return 'text-red-500'
  if (status >= 400) return 'text-amber-500'
  return 'text-emerald-500'
}

export function CallLogsSidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n()
  const logs = useCallLogStore((s) => s.logs)
  const selectedId = useCallLogStore((s) => s.selectedId)
  const setLogs = useCallLogStore((s) => s.setLogs)
  const appendLog = useCallLogStore((s) => s.appendLog)
  const select = useCallLogStore((s) => s.select)
  const clear = useCallLogStore((s) => s.clear)

  useEffect(() => {
    getCallLogs().then(setLogs)
    return onCallLog((entry) => appendLog(entry))
  }, [setLogs, appendLog])

  async function handleClear() {
    try {
      await clearCallLogs()
    } finally {
      clear()
    }
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r border-border bg-sidebar transition-[opacity] duration-200',
        collapsed && 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-sidebar-foreground">
          <ScrollText className="size-4" />
          {t('nav.logs')}
        </span>
        <button
          onClick={handleClear}
          aria-label={t('logs.clear')}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {logs.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">{t('logs.empty')}</p>
        ) : (
          <div className="flex flex-col gap-0.5 p-1.5">
            {[...logs].reverse().map((log) => (
              <button
                key={log.id}
                onClick={() => select(log.id === selectedId ? null : log.id)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
                  log.id === selectedId
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {log.kind === 'gateway' ? (
                    <Zap className="size-3.5 shrink-0" />
                  ) : (
                    <MessageSquareText className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {log.method} {log.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={statusColor(log.status)}>{log.status}</span>
                  <span>{formatTime(log.timestamp)}</span>
                  <span>{log.durationMs}ms</span>
                  {log.stream && <span>{t('logs.stream')}</span>}
                  {log.error && <span className="truncate text-red-500">{log.error}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
