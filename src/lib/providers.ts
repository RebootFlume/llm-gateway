import type { MessageKey } from '@/lib/i18n'

export type AdapterType = 'openai-compatible' | 'anthropic' | 'gemini' | 'script'

export const ADAPTER_TYPES: {
  value: AdapterType
  labelKey: MessageKey
  hintKey: MessageKey
}[] = [
  {
    value: 'openai-compatible',
    labelKey: 'adapter.openaiCompatible',
    hintKey: 'adapter.openaiCompatibleHint',
  },
  {
    value: 'anthropic',
    labelKey: 'adapter.anthropic',
    hintKey: 'adapter.anthropicHint',
  },
  {
    value: 'gemini',
    labelKey: 'adapter.gemini',
    hintKey: 'adapter.geminiHint',
  },
  {
    value: 'script',
    labelKey: 'adapter.customScript',
    hintKey: 'adapter.customScriptHint',
  },
]

export interface ModelEntry {
  id: string
  alias: string
  model: string
  fallback?: string
  context: string
  priceIn: string
  priceOut: string
  enabled: boolean
}

export interface Provider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'
  adapter: AdapterType
  baseUrl: string
  apiKey: string
  enabled: boolean
  status: 'connected' | 'disconnected' | 'testing' | 'failed'
  custom: boolean
  models: ModelEntry[]
  scriptContent?: string
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    enabled: false,
    status: 'disconnected',
    custom: false,
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    enabled: false,
    status: 'disconnected',
    custom: false,
    models: [],
  },
  {
    id: 'google',
    name: 'Google AI',
    type: 'google',
    adapter: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    enabled: false,
    status: 'disconnected',
    custom: false,
    models: [],
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    type: 'ollama',
    adapter: 'openai-compatible',
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    enabled: false,
    status: 'disconnected',
    custom: false,
    models: [],
  },
]

export function maskKey(key: string): string {
  if (!key) return '-'
  if (key.length <= 8) return `${key.slice(0, 2)}••••`
  return `${key.slice(0, 6)}••••${key.slice(-3)}`
}

export const DEFAULT_SCRIPT = `// Custom adapter script
// Transform any API to OpenAI-compatible format.
// Runs in the gateway's main-process sandbox; module-level state persists
// across calls (recompiled when you edit the script).
//
// env  = { baseUrl, apiKey }
// http = { get(url, headers), post(url, headers, body) }
//        Async functions (use await), returns { ok, status, body, text }

export const meta = {
  defaultBaseUrl: '',           // pre-fills URL field when empty (user can override)
  description: 'Custom adapter',
}

// ── Chat: preflight + main request spec ──────────────
// Use async when calling http.get/http.post (they are async).
export async function prepareRequest(openaiReq, env, http) {
  // Preflight: call await http.post/get, check responses, maintain state in module vars.
  // Example: await ensureInitialized(env, http)

  return {
    url: env.baseUrl + '/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.apiKey,
      'Content-Type': 'application/json',
    },
    body: openaiReq,
  }
}

// ── Stream: factory returning a stateful parser ──────
// The gateway calls createStreamParser() once, then parser.parseLine(line) per
// upstream line. Returns { delta } or { delta, finishReason, usage } or null.
export function createStreamParser(model, completionId, created) {
  var chunkIndex = 0
  return {
    parseLine: function (line) {
      // Parse one upstream line -> { delta } | { delta, finishReason, usage } | null
      return null
    },
  }
}

// ── Non-stream: transform full response -> OpenAI response ──
export function parseResponse(rawBody, model, completionId, created) {
  // rawBody = full upstream response text (NDJSON or JSON)
  return {
    id: completionId,
    object: 'chat.completion',
    created: created,
    model: model,
    choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ── Models: call http to fetch, parse, return [{ id, ownedBy? }] ──
export async function listModels(env, http) {
  var r = await http.get(env.baseUrl + '/models', {
    'Authorization': 'Bearer ' + env.apiKey,
  })
  if (!r.ok) return []
  return r.body.data.map(function (m) { return { id: m.id } })
}
`
