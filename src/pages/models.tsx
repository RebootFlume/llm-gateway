import { useState, useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n'
import { useProvidersStore } from '@/lib/store/providers'
import {
  ADAPTER_TYPES,
  type Provider,
} from '@/lib/providers'
import { testConnection, listScriptModels, validateScript, previewScriptRequest, type PreparedRequest } from '@/lib/provider-api'
import { AddModelDialog } from '@/components/AddModelDialog'
import { ArrowRight, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'

const STATUS_DOT: Record<Provider['status'], string> = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-muted-foreground/40',
  testing: 'bg-amber-500 animate-pulse',
  failed: 'bg-red-500',
}

const STATUS_LABEL_KEY: Record<Provider['status'], MessageKey> = {
  connected: 'models.statusConnected',
  disconnected: 'models.statusNotTested',
  testing: 'models.statusTesting',
  failed: 'models.statusFailed',
}

const ADAPTER_LABEL_KEY: Record<string, MessageKey> = Object.fromEntries(
  ADAPTER_TYPES.map((a) => [a.value, a.labelKey]),
)

function HeaderCell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </div>
  )
}

export function ModelsPage() {
  const { t } = useI18n()
  const { providerId } = useParams()
  const providers = useProvidersStore((s) => s.providers)
  const updateProvider = useProvidersStore((s) => s.updateProvider)
  const setProviderStatus = useProvidersStore((s) => s.setProviderStatus)
  const setModelAlias = useProvidersStore((s) => s.setModelAlias)
  const setModelEnabled = useProvidersStore((s) => s.setModelEnabled)
  const removeModel = useProvidersStore((s) => s.removeModel)

  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [scriptError, setScriptError] = useState('')
  const [preview, setPreview] = useState<PreparedRequest | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const provider = providers.find((p) => p.id === providerId)

  // Auto-fill URL from script's meta.defaultBaseUrl when URL is empty.
  // User's URL always wins; script default only fills the blank.
  useEffect(() => {
    if (!provider || provider.adapter !== 'script') return
    if (provider.baseUrl.trim()) return
    if (!provider.scriptContent) return
    const m = provider.scriptContent.match(
      /defaultBaseUrl['"]\s*:\s*['"]([^'"]+)['"]/,
    )
    if (m && m[1]) {
      updateProvider(provider.id, { baseUrl: m[1] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.scriptContent])

  // Save-time validation: compile-check the script (debounced) and show errors.
  useEffect(() => {
    if (!provider || provider.adapter !== 'script' || !provider.scriptContent) {
      setScriptError('')
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      validateScript(provider.scriptContent!)
        .then((r) => {
          if (!cancelled) setScriptError(r.ok ? '' : r.error ?? '')
        })
        .catch(() => {
          if (!cancelled) setScriptError('')
        })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.adapter, provider?.scriptContent])

  async function handlePreview() {
    if (p.adapter !== 'script') return
    setPreviewing(true)
    setPreviewError('')
    setPreview(null)
    try {
      const sample = {
        model: p.models?.[0]?.model || 'default-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }
      const spec = await previewScriptRequest(
        {
          id: p.id,
          scriptContent: p.scriptContent,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
        },
        sample,
      )
      setPreview(spec)
    } catch (e) {
      setPreviewError(String(e))
    } finally {
      setPreviewing(false)
    }
  }

  if (!provider) {
    return <Navigate to={`/models/${providers[0].id}`} replace />
  }

  const p = provider

  function cfg() {
    return {
      adapter: p.adapter,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      scriptContent: p.scriptContent,
    }
  }

  async function handleTest() {
    setTesting(true)
    setProviderStatus(p.id, 'testing')
    setTestMsg(t('models.testing'))
    try {
      if (p.adapter === 'script' && p.scriptContent) {
        const list = await listScriptModels({
          id: p.id,
          scriptContent: p.scriptContent,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
        })
        setProviderStatus(p.id, 'connected')
        setTestMsg(t('models.connectedFound', { count: list.length }))
      } else {
        const r = await testConnection(cfg())
        setProviderStatus(p.id, r.ok ? 'connected' : 'failed')
        setTestMsg(r.ok ? `${r.message} (${r.latencyMs}ms)` : r.message)
      }
    } catch (e) {
      setProviderStatus(p.id, 'failed')
      setTestMsg(String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={p.name} subtitle={t('models.subtitle')} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
        {/* Provider config card */}
        <div className="shrink-0 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-1.5 rounded-full',
                STATUS_DOT[p.status],
              )}
            />
            <span className="text-sm font-medium text-foreground">
              {p.name}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {p.type}
            </span>
            {p.custom && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                custom
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Label
                htmlFor="p-enabled"
                className="text-xs text-muted-foreground"
              >
                {t('models.enabled')}
              </Label>
              <Switch
                id="p-enabled"
                checked={p.enabled}
                onCheckedChange={(v) => updateProvider(p.id, { enabled: v })}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-url" className="text-xs text-muted-foreground">
                {t('models.baseUrl')}
              </Label>
              <Input
                id="p-url"
                value={p.baseUrl}
                onChange={(e) =>
                  updateProvider(p.id, { baseUrl: e.target.value })
                }
                placeholder="https://api.openai.com/v1"
                className="font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="p-key" className="text-xs text-muted-foreground">
                {t('models.apiKey')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="p-key"
                  type={showKey ? 'text' : 'password'}
                  value={p.apiKey}
                  onChange={(e) =>
                    updateProvider(p.id, { apiKey: e.target.value })
                  }
                  placeholder={t('models.apiKeyPlaceholder')}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t('models.hideKey') : t('models.showKey')}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('models.format')}</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-sm text-foreground">
                {t(ADAPTER_LABEL_KEY[p.adapter] ?? 'adapter.openaiCompatible')}
              </div>
            </div>

            {p.adapter === 'script' && (
              <div className="grid gap-1.5">
                <Label
                  htmlFor="p-script"
                  className="text-xs text-muted-foreground"
                >
                  {t('models.adapterScript')}
                </Label>
                <textarea
                  id="p-script"
                  value={p.scriptContent ?? ''}
                  onChange={(e) =>
                    updateProvider(p.id, { scriptContent: e.target.value })
                  }
                  spellCheck={false}
                  className="h-64 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  placeholder={t('models.adapterScriptPlaceholder')}
                />
                {scriptError && (
                  <p className="text-xs text-red-500">
                    {t('models.scriptError', { message: scriptError })}
                  </p>
                )}
                {!scriptError && p.scriptContent && (
                  <p className="text-xs text-emerald-600">
                    {t('models.scriptValid')}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={previewing}
                    className="gap-1.5"
                  >
                    {previewing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {t('models.previewRequest')}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t('models.previewHint')}
                  </span>
                </div>
                {previewError && (
                  <p className="text-xs text-red-500">{previewError}</p>
                )}
                {preview && (
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t('models.testConnection')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {testMsg || t(STATUS_LABEL_KEY[p.status])}
            </span>
          </div>
        </div>

        <Separator className="shrink-0" />

        {/* Models header */}
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">{t('models.models')}</h2>
          <AddModelDialog providerId={p.id} />
        </div>

        {/* Models table */}
        {provider.models.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('models.noModelsYet')}
          </div>
        ) : (
          <div className="flex min-h-40 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[auto_1.2fr_1.4fr_1fr_0.7fr_1fr_32px] shrink-0 gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <HeaderCell className="w-8">{t('models.on')}</HeaderCell>
              <HeaderCell>{t('models.alias')}</HeaderCell>
              <HeaderCell>{t('models.model')}</HeaderCell>
              <HeaderCell>{t('models.fallback')}</HeaderCell>
              <HeaderCell>{t('models.context')}</HeaderCell>
              <HeaderCell>{t('models.price')}</HeaderCell>
              <HeaderCell className="w-8">{''}</HeaderCell>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {provider.models.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'grid grid-cols-[auto_1.2fr_1.4fr_1fr_0.7fr_1fr_32px] items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-0 hover:bg-accent/40',
                    !m.enabled && 'opacity-40',
                  )}
                >
                  <Switch
                    size="sm"
                    checked={m.enabled}
                    onCheckedChange={(v) => setModelEnabled(p.id, m.id, v)}
                    aria-label={t('models.toggleModel', { name: m.alias })}
                  />
                  <input
                    className="h-7 w-full rounded-md border border-transparent bg-transparent px-2 font-mono text-sm text-foreground outline-none hover:border-border focus:border-border focus:bg-background"
                    value={m.alias}
                    onChange={(e) =>
                      setModelAlias(p.id, m.id, e.target.value)
                    }
                  />
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ArrowRight className="size-3" />
                    <span className="truncate font-mono">{m.model}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.fallback ?? '-'}
                  </span>
                  <span className="text-muted-foreground">{m.context}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.priceIn} / {m.priceOut}
                  </span>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-red-500"
                    onClick={() => removeModel(p.id, m.id)}
                    aria-label={t('models.deleteModel', { name: m.alias })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        <p className="shrink-0 text-xs text-muted-foreground">
          {t('models.exposedVia')}{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            /v1/chat/completions
          </code>
        </p>
      </div>
    </div>
  )
}
