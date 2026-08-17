import { useCallLogStore } from '@/lib/store/call-log'
import { useI18n } from '@/lib/i18n'
import { ScrollArea } from '@/components/ui/scroll-area'

function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span className="truncate text-sm text-foreground">{value ?? '-'}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-border pb-1.5 text-base font-semibold text-foreground">
      {children}
    </h2>
  )
}

function HeadersView({
  headers,
  title,
}: {
  headers: Record<string, string> | null
  title: string
}) {
  if (!headers || Object.keys(headers).length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="rounded-md border border-border bg-muted/30 p-2.5">
        {Object.entries(headers).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,180px)_1fr] gap-2 py-0.5 font-mono text-xs">
            <span className="text-muted-foreground">{k}:</span>
            <span className="break-all text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BodyView({ body, title }: { body: string | null; title: string }) {
  if (!body) return null
  // Re-indent JSON bodies so long single-line requests read as nested blocks.
  let formatted = body
  try {
    formatted = JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    /* keep raw text as-is */
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2.5 font-mono text-xs leading-relaxed text-foreground">
        {formatted}
      </pre>
    </div>
  )
}

export function CallLogDetailPage() {
  const { t } = useI18n()
  const logs = useCallLogStore((s) => s.logs)
  const selectedId = useCallLogStore((s) => s.selectedId)
  const entry = logs.find((l) => l.id === selectedId) ?? null

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {t('logs.selectPrompt')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
          <section className="flex flex-col gap-3">
            <SectionTitle>{t('logs.overview')}</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label={t('logs.kind')} value={entry.kind} />
              <Field label={t('logs.timestamp')} value={formatDateTime(entry.timestamp)} />
              <Field label={t('logs.method')} value={entry.method} />
              <Field label={t('logs.path')} value={entry.path} />
              <Field label={t('logs.status')} value={entry.status} />
              <Field label={t('logs.duration')} value={`${entry.durationMs}ms`} />
              <Field label={t('logs.model')} value={entry.model} />
              <Field label={t('logs.tokens')} value={entry.tokens} />
              <Field label={t('logs.ip')} value={entry.ip} />
              <Field label={t('logs.stream')} value={entry.stream ? t('logs.stream') : '-'} />
            </div>
            {entry.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-600">
                {entry.error}
              </div>
            )}
            {entry.truncated && (
              <span className="text-xs text-muted-foreground">{t('logs.truncated')}</span>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t('logs.request')}</SectionTitle>
            <HeadersView headers={entry.requestHeaders} title={t('logs.headers')} />
            <BodyView body={entry.requestBody} title={t('logs.body')} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t('logs.response')}</SectionTitle>
            <HeadersView headers={entry.responseHeaders} title={t('logs.headers')} />
            <BodyView body={entry.responseBody} title={t('logs.body')} />
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
