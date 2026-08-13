import { create } from 'zustand'
import {
  PROVIDERS,
  type AdapterType,
  type ModelEntry,
  type Provider,
} from '@/lib/providers'

function genId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `provider-${Date.now()}`
  )
}

type ProviderStatus = Provider['status']

interface ProvidersState {
  providers: Provider[]
  addProvider: (input: {
    name: string
    adapter: AdapterType
    baseUrl: string
    apiKey: string
    scriptContent?: string
  }) => Provider
  removeProvider: (id: string) => void
  updateProvider: (id: string, patch: Partial<Provider>) => void
  setProviderStatus: (id: string, status: ProviderStatus) => void
  setModels: (id: string, models: ModelEntry[]) => void
  setModelAlias: (providerId: string, modelId: string, alias: string) => void
  setModelEnabled: (providerId: string, modelId: string, enabled: boolean) => void
  addModel: (providerId: string, model: string, alias: string) => void
  removeModel: (providerId: string, modelId: string) => void
  getProvider: (id: string | undefined) => Provider | undefined
}

export const useProvidersStore = create<ProvidersState>()((set, get) => ({
  providers: PROVIDERS,
  addProvider: ({ name, adapter, baseUrl, apiKey, scriptContent }) => {
    const provider: Provider = {
      id: genId(name),
      name,
      type: 'custom',
      adapter,
      baseUrl,
      apiKey,
      enabled: true,
      status: 'disconnected',
      custom: true,
      models: [],
      ...(scriptContent !== undefined ? { scriptContent } : {}),
    }
    set((s) => ({ providers: [...s.providers, provider] }))
    return provider
  },
  removeProvider: (id) =>
    set((s) => ({
      providers: s.providers.filter((p) => p.id !== id || !p.custom),
    })),
  updateProvider: (id, patch) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    })),
  setProviderStatus: (id, status) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id ? { ...p, status } : p,
      ),
    })),
  setModels: (id, models) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id ? { ...p, models } : p,
      ),
    })),
  setModelAlias: (providerId, modelId, alias) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === providerId
          ? {
              ...p,
              models: p.models.map((m) =>
                m.id === modelId ? { ...m, alias } : m,
              ),
            }
          : p,
      ),
    })),
  setModelEnabled: (providerId, modelId, enabled) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === providerId
          ? {
              ...p,
              models: p.models.map((m) =>
                m.id === modelId ? { ...m, enabled } : m,
              ),
            }
          : p,
      ),
    })),
  addModel: (providerId, model, alias) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === providerId
          ? {
              ...p,
              models: [
                ...p.models,
                {
                  id: `${model}-${Date.now()}`,
                  alias: alias || model,
                  model,
                  context: '-',
                  priceIn: '-',
                  priceOut: '-',
                  enabled: true,
                },
              ],
            }
          : p,
      ),
    })),
  removeModel: (providerId, modelId) =>
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === providerId
          ? { ...p, models: p.models.filter((m) => m.id !== modelId) }
          : p,
      ),
    })),
  getProvider: (id) => get().providers.find((p) => p.id === id),
}))
