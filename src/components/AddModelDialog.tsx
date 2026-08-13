import { useState, useEffect, useRef } from 'react'
import { Plus, Loader2, Search } from 'lucide-react'
import { useProvidersStore } from '@/lib/store/providers'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { pullModels, listScriptModels } from '@/lib/provider-api'

export function AddModelDialog({ providerId }: { providerId: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState('')
  const [alias, setAlias] = useState('')
  const [fetching, setFetching] = useState(false)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; ownedBy?: string }> | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const provider = useProvidersStore((s) => s.getProvider(providerId))
  const addModel = useProvidersStore((s) => s.addModel)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (availableModels && searchRef.current) {
      searchRef.current.focus()
    }
  }, [availableModels])

  const valid = model.trim()
  const filtered = availableModels?.filter((m) =>
    m.id.toLowerCase().includes(searchQuery.toLowerCase()),
  ) ?? []

  async function handleFetch() {
    if (!provider) return
    setFetching(true)
    setFetchError('')
    try {
      let list: Array<{ id: string; ownedBy?: string }>
      if (provider.adapter === 'script' && provider.scriptContent) {
        list = await listScriptModels({
          id: provider.id,
          scriptContent: provider.scriptContent,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        })
      } else {
        list = await pullModels({
          adapter: provider.adapter,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          scriptContent: provider.scriptContent,
        })
      }
      setAvailableModels(list)
    } catch (e) {
      setFetchError(String(e))
    } finally {
      setFetching(false)
    }
  }

  function selectModel(id: string) {
    setModel(id)
    setAlias(id)
  }

  function reset() {
    setModel('')
    setAlias('')
    setAvailableModels(null)
    setFetchError('')
    setSearchQuery('')
  }

  function handleSubmit() {
    if (!valid) return
    addModel(providerId, model.trim(), alias.trim())
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" aria-label={t('addModel.button')} />
        }
      >
        <Plus className="size-4" /> {t('addModel.button')}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addModel.button')}</DialogTitle>
          <DialogDescription>{t('addModel.desc')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {/* Fetch section */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFetch}
              disabled={fetching}
              className="gap-1.5"
            >
              {fetching ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t('addModel.fetch')}
            </Button>
            {availableModels && (
              <span className="text-xs text-muted-foreground">
                {t('addModel.loaded', { count: availableModels.length })}
              </span>
            )}
          </div>
          {fetchError && (
            <p className="text-xs text-red-500">{fetchError}</p>
          )}

          {/* Model list after fetch */}
          {availableModels && availableModels.length > 0 && (
            <div className="rounded-md border border-border">
              <div className="flex items-center border-b border-border px-2">
                <Search className="mr-1.5 size-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  placeholder={t('addModel.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    {t('addModel.noMatch')}
                  </p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent/50"
                      onClick={() => selectModel(m.id)}
                    >
                      {m.id}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Manual inputs */}
          <div className="grid gap-1.5">
            <Label htmlFor="m-model">{t('addModel.modelId')}</Label>
            <Input
              id="m-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t('addModel.modelIdPlaceholder')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-alias">{t('addModel.alias')}</Label>
            <Input
              id="m-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('addModel.aliasPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false) }}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!valid}>
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
