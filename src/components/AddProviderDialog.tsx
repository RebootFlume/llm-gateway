import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useProvidersStore } from '@/lib/store/providers'
import { useI18n } from '@/lib/i18n'
import {
  ADAPTER_TYPES,
  DEFAULT_SCRIPT,
  type AdapterType,
} from '@/lib/providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function AddProviderDialog() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [adapter, setAdapter] = useState<AdapterType>('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  const addProvider = useProvidersStore((s) => s.addProvider)
  const navigate = useNavigate()

  const adapterType = ADAPTER_TYPES.find((a) => a.value === adapter)
  const valid = name.trim() && (adapter === 'script' || baseUrl.trim())

  function reset() {
    setName('')
    setAdapter('openai-compatible')
    setBaseUrl('')
    setApiKey('')
  }

  function handleSubmit() {
    if (!valid) return
    const created = addProvider({
      name: name.trim(),
      adapter,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      ...(adapter === 'script' ? { scriptContent: DEFAULT_SCRIPT } : {}),
    })
    reset()
    setOpen(false)
    navigate(`/models/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('addProvider.title')}
          />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addProvider.title')}</DialogTitle>
          <DialogDescription>{t('addProvider.desc')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="p-name">{t('addProvider.name')}</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('addProvider.namePlaceholder')}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-adapter">{t('addProvider.format')}</Label>
            <Select
              value={adapter}
              onValueChange={(v) => setAdapter(v as AdapterType)}
            >
              <SelectTrigger id="p-adapter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADAPTER_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {t(type.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adapterType && (
              <p className="text-xs text-muted-foreground">{t(adapterType.hintKey)}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-url">
              {t('addProvider.baseUrl')}
              {adapter === 'script' && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {t('addProvider.optional')}
                </span>
              )}
            </Label>
            <Input
              id="p-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-key">{t('addProvider.apiKey')}</Label>
            <Input
              id="p-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('addProvider.apiKeyPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!valid}>
            {t('addProvider.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
