export interface ProviderConfig {
  adapter: string
  baseUrl: string
  apiKey: string
  scriptContent?: string
}

export interface TestResult {
  ok: boolean
  message: string
  latencyMs: number
  modelCount: number
}

export interface ModelInfo {
  id: string
  ownedBy?: string
}

const TIMEOUT_MS = 30_000

function trimBase(url: string): string {
  return url.replace(/\/+$/, '')
}

async function request(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`HTTP ${resp.status}: ${text}`)
    }
    return resp
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOpenai(p: ProviderConfig): Promise<ModelInfo[]> {
  const url = `${trimBase(p.baseUrl)}/models`
  const headers: Record<string, string> = {}
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  const resp = await request(url, { headers })
  const body = (await resp.json()) as { data?: { id: string; owned_by?: string }[] }
  return (body.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by }))
}

async function fetchAnthropic(p: ProviderConfig): Promise<ModelInfo[]> {
  const url = `${trimBase(p.baseUrl)}/models`
  const resp = await request(url, {
    headers: {
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  const body = (await resp.json()) as { data?: { id: string }[] }
  return (body.data ?? []).map((m) => ({ id: m.id }))
}

async function fetchGemini(p: ProviderConfig): Promise<ModelInfo[]> {
  const url = `${trimBase(p.baseUrl)}/models${p.apiKey ? `?key=${encodeURIComponent(p.apiKey)}` : ''}`
  const resp = await request(url)
  const body = (await resp.json()) as { models?: { name: string }[] }
  return (body.models ?? []).map((m) => ({ id: m.name.replace(/^models\//, '') }))
}

export async function fetchModels(provider: ProviderConfig): Promise<ModelInfo[]> {
  switch (provider.adapter) {
    case 'openai-compatible':
      return fetchOpenai(provider)
    case 'anthropic':
      return fetchAnthropic(provider)
    case 'gemini':
      return fetchGemini(provider)
    case 'script':
      throw new Error(
        'Script adapters run in the main-process runtime; use script_list_models instead of pull_models.',
      )
    default:
      throw new Error(`Unsupported adapter: ${provider.adapter}`)
  }
}

export async function runTestConnection(provider: ProviderConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const models = await fetchModels(provider)
    return {
      ok: true,
      message: `Connected · ${models.length} models found`,
      latencyMs: Date.now() - start,
      modelCount: models.length,
    }
  } catch (e) {
    return {
      ok: false,
      message: (e as Error).message,
      latencyMs: Date.now() - start,
      modelCount: 0,
    }
  }
}
