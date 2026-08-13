import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGatewayStore } from '@/lib/store/gateway'
import { BIND_OPTIONS } from '@/lib/gateway'
import { startGateway, stopGateway } from '@/lib/gateway-api'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, Loader2, Play, Square } from 'lucide-react'

export function GatewayPage() {
  const { t } = useI18n()
  const config = useGatewayStore((s) => s.config)
  const running = useGatewayStore((s) => s.running)
  const setPort = useGatewayStore((s) => s.setPort)
  const setBindAddress = useGatewayStore((s) => s.setBindAddress)
  const setApiKey = useGatewayStore((s) => s.setApiKey)
  const setRunning = useGatewayStore((s) => s.setRunning)

  const [showKey, setShowKey] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const listenUrl = `http://${config.bindAddress}:${config.port}`
  const displayUrl = `http://${
    config.bindAddress === '0.0.0.0' ? '<your-ip>' : '127.0.0.1'
  }:${config.port}/v1`

  async function handleToggle() {
    setError('')
    if (running) {
      try {
        await stopGateway()
        setRunning(false)
      } catch (e) {
        setError(String(e))
      }
      return
    }
    setStarting(true)
    try {
      await startGateway(config.port, config.bindAddress, config.apiKey)
      setRunning(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('gateway.pageTitle')} subtitle={t('gateway.pageSubtitle')} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
        <div className="shrink-0 rounded-lg border border-border bg-card p-4">
          {/* Status row */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-1.5 rounded-full',
                running ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
            />
            <span className="text-sm font-medium text-foreground">
              {running ? t('gateway.running') : t('gateway.stopped')}
            </span>
            <span className="ml-auto">
              <Button
                variant={running ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggle}
                disabled={starting}
                className="gap-1.5"
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : running ? (
                  <Square className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {starting ? t('gateway.starting') : running ? t('gateway.stop') : t('gateway.start')}
              </Button>
            </span>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}

          <div className="mt-4 grid gap-3">
            {/* Port */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-port" className="text-xs text-muted-foreground">
                {t('gateway.listenPort')}
              </Label>
              <Input
                id="gw-port"
                type="number"
                min={1024}
                max={65535}
                value={config.port}
                onChange={(e) => setPort(Number(e.target.value) || 8080)}
                className="w-32 font-mono"
              />
            </div>

            {/* Bind address */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('gateway.bindAddress')}
              </Label>
              <div className="flex flex-wrap gap-3">
                {BIND_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      config.bindAddress === opt.value
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    <input
                      type="radio"
                      name="bind-address"
                      value={opt.value}
                      checked={config.bindAddress === opt.value}
                      onChange={() => setBindAddress(opt.value)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        'size-3 rounded-full border',
                        config.bindAddress === opt.value
                          ? 'border-4 border-primary'
                          : 'border-muted-foreground/40',
                      )}
                    />
                    <span>{t(opt.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-key" className="text-xs text-muted-foreground">
                {t('gateway.apiKey')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="gw-key"
                  type={showKey ? 'text' : 'password'}
                  value={config.apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('gateway.apiKeyPlaceholder')}
                  className="max-w-sm font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t('gateway.hideKey') : t('gateway.showKey')}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('gateway.clientsSend')} <code className="rounded bg-muted px-1 font-mono">Authorization: Bearer &lt;key&gt;</code>
              </p>
            </div>
          </div>

          {/* Separator + URL */}
          <div className="mt-4 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">{t('gateway.endpoint')}</Label>
            <p className="mt-1 font-mono text-sm text-foreground">
              {running ? displayUrl : listenUrl}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {running ? t('gateway.readyForClients') : t('gateway.startHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
