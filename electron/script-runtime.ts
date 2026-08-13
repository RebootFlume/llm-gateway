// Persistent per-provider adapter-script runtime.
//
// Each provider owns one sandboxed context that is compiled once and reused, so
// module-level state (session caches, init throttles, ...) survives across
// requests — the semantics of a real reverse proxy. Scripts execute in the main
// process (not the renderer), so the gateway can call them directly without the
// old `gateway:proxy-request` IPC round-trip.
//
// Contract — function names are the recognition protocol; `export` keywords are
// stripped before evaluation:
//   meta                { defaultBaseUrl, description }              (optional)
//   prepareRequest      (openaiReq, env, http) -> { url, method, headers, body }
//   createStreamParser  (model, completionId, created) -> { parseLine(line) }
//   parseResponse       (rawBody, model, completionId, created) -> chat.completion
//   listModels          (env, http) -> [{ id, ownedBy? }]
//
//   env  = { baseUrl, apiKey }
//   http = { get(url, headers), post(url, headers, body) } -> { ok, status, body, text }
//
// State semantics: module-level declarations persist per runtime instance. A
// runtime is recreated when its provider config (script/baseUrl/apiKey) changes,
// and per stream the parser returned by createStreamParser keeps its closure
// state across parseLine calls.
//
// Security: `vm` is not a hard sandbox — user-authored scripts are trusted, as
// before (the old code ran them in the renderer). The whitelisted globals just
// prevent accidental use of Node internals; async calls are timeout-guarded.

import * as vm from 'node:vm'
import { httpRequest } from './http-request'

export interface ScriptRuntimeConfig {
  scriptContent: string
  baseUrl: string
  apiKey: string
}

export interface PreparedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export interface ScriptDelta {
  delta?: Record<string, unknown>
  finishReason?: string
  usage?: Record<string, unknown>
}

export interface ModelInfo {
  id: string
  ownedBy?: string
}

export interface ScriptValidation {
  ok: boolean
  error?: string
}

export interface HttpHelper {
  get(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown; text: string }>
  post(url: string, headers: Record<string, string>, body: unknown): Promise<{ ok: boolean; status: number; body: unknown; text: string }>
}

const COMPILE_TIMEOUT_MS = 5_000
const CALL_TIMEOUT_MS = 30_000
const STREAM_TIMEOUT_MS = 300_000

function stripExports(code: string): string {
  return code
    .replace(/export\s+(async\s+)?function\s+/g, '$1function ')
    .replace(/export\s+(const|var|let)\s+/g, '$1 ')
    .replace(/^export\s+/gm, '')
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    )
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** HTTP request helper injected into every script (same shape as the old
 *  renderer-side `http`, but runs on the real httpRequest in the main process).
 *  Scripts may fire-and-forget calls; a failure must not surface as an
 *  unhandled rejection that crashes the main process — the noop catch marks the
 *  promise handled while awaited callers still receive the rejection. */
export function makeHttp(): HttpHelper {
  return {
    get(url: string, headers: Record<string, string>) {
      const p = httpRequest({ method: 'GET', url, headers, body: null })
      p.catch(() => {})
      return p
    },
    post(url: string, headers: Record<string, string>, body: unknown) {
      const p = httpRequest({ method: 'POST', url, headers, body })
      p.catch(() => {})
      return p
    },
  }
}

export class ScriptRuntime {
  private readonly id: string
  private readonly config: ScriptRuntimeConfig
  private readonly env: { baseUrl: string; apiKey: string }
  private readonly http: HttpHelper
  private context: vm.Context | null = null

  constructor(id: string, config: ScriptRuntimeConfig) {
    this.id = id
    this.config = config
    this.env = { baseUrl: config.baseUrl, apiKey: config.apiKey }
    this.http = makeHttp()
  }

  matches(config: ScriptRuntimeConfig): boolean {
    return (
      this.config.scriptContent === config.scriptContent &&
      this.config.baseUrl === config.baseUrl &&
      this.config.apiKey === config.apiKey
    )
  }

  dispose(): void {
    this.context = null
  }

  /** Compile and evaluate the script once. Throws on syntax/reference errors. */
  ensureCompiled(): vm.Context {
    if (this.context) return this.context
    const sandbox: Record<string, unknown> = {
      env: this.env,
      http: this.http,
      console,
      setTimeout,
      clearTimeout,
    }
    const context = vm.createContext(sandbox)
    // timeout guards against infinite top-level loops at load time.
    vm.runInContext(stripExports(this.config.scriptContent), context, {
      timeout: COMPILE_TIMEOUT_MS,
      filename: `adapter://${this.id}.js`,
    })
    this.context = context
    return context
  }

  private fn(name: string): (...args: unknown[]) => unknown {
    const ctx = this.ensureCompiled()
    const f = (ctx as Record<string, unknown>)[name]
    if (typeof f !== 'function') {
      throw new Error(`Adapter script is missing required export '${name}'`)
    }
    return f as (...args: unknown[]) => unknown
  }

  private async callAsync(
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
    label: string,
  ): Promise<unknown> {
    let promise: Promise<unknown>
    try {
      promise = Promise.resolve(fn.apply(this.context, args))
    } catch (e) {
      promise = Promise.reject(e)
    }
    return withTimeout(promise, CALL_TIMEOUT_MS, label)
  }

  private callSync(fn: (...args: unknown[]) => unknown, args: unknown[]): unknown {
    return fn.apply(this.context, args)
  }

  async prepareRequest(openaiReq: unknown): Promise<PreparedRequest> {
    const result = (await this.callAsync(
      this.fn('prepareRequest'),
      [openaiReq, this.env, this.http],
      `prepareRequest (${this.id})`,
    )) as Record<string, unknown> | null | undefined

    if (!result || typeof result.url !== 'string' || typeof result.method !== 'string') {
      throw new Error('prepareRequest must return { url, method, headers, body }')
    }
    return {
      url: result.url,
      method: result.method,
      headers: (result.headers ?? {}) as Record<string, string>,
      body: result.body ?? null,
    }
  }

  createStreamParser(
    model: string,
    completionId: string,
    created: number,
  ): { parseLine: (line: string) => ScriptDelta | null } {
    const result = this.callSync(this.fn('createStreamParser'), [
      model,
      completionId,
      created,
    ]) as { parseLine?: (line: string) => unknown } | null | undefined
    if (!result || typeof result.parseLine !== 'function') {
      throw new Error('createStreamParser must return { parseLine }')
    }
    return {
      parseLine: (line: string) => {
        const out = result.parseLine!(line) as ScriptDelta | null | undefined
        return out ?? null
      },
    }
  }

  parseResponse(
    rawBody: string,
    model: string,
    completionId: string,
    created: number,
  ): unknown {
    return this.callSync(this.fn('parseResponse'), [
      rawBody,
      model,
      completionId,
      created,
    ])
  }

  async listModels(): Promise<ModelInfo[]> {
    const list = await this.callAsync(this.fn('listModels'), [this.env, this.http], `listModels (${this.id})`)
    if (!Array.isArray(list)) return []
    return list.filter(
      (m): m is ModelInfo =>
        !!m && typeof m === 'object' && typeof (m as ModelInfo).id === 'string',
    )
  }
}

// ── Runtime cache ────────────────────────────────────────────────────────────

const runtimes = new Map<string, ScriptRuntime>()

/** Get the persistent runtime for a provider, recompiling if its config changed. */
export function getRuntime(id: string, config: ScriptRuntimeConfig): ScriptRuntime {
  const existing = runtimes.get(id)
  if (existing && existing.matches(config)) return existing
  const rt = new ScriptRuntime(id, config)
  runtimes.set(id, rt)
  return rt
}

export function disposeRuntime(id: string): void {
  runtimes.delete(id)
}

// ── Upstream HTTP + stream consumption ───────────────────────────────────────

export async function fetchScriptRequest(prepared: PreparedRequest): Promise<Response> {
  const body =
    prepared.body === null || prepared.body === undefined
      ? undefined
      : typeof prepared.body === 'string'
        ? prepared.body
        : JSON.stringify(prepared.body)
  return fetch(prepared.url, {
    method: prepared.method || 'POST',
    headers: prepared.headers ?? {},
    body,
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  })
}

/** Read an upstream body, split it into lines and feed each to the script's
 *  stream parser, invoking `onDelta` for every produced result. */
export async function consumeScriptStream(
  runtime: ScriptRuntime,
  upstream: Response,
  model: string,
  completionId: string,
  created: number,
  onDelta: (result: ScriptDelta) => void,
): Promise<void> {
  if (!upstream.body) return
  const parser = runtime.createStreamParser(model, completionId, created)
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      const result = parser.parseLine(line)
      if (result) onDelta(result)
    }
  }
  const tail = buffer.trim()
  if (tail) {
    const result = parser.parseLine(tail)
    if (result) onDelta(result)
  }
}

/** prepareRequest -> upstream stream -> parse per line. Used by the chat page. */
export async function streamUpstream(
  runtime: ScriptRuntime,
  prepared: PreparedRequest,
  model: string,
  completionId: string,
  created: number,
  onDelta: (result: ScriptDelta) => void,
): Promise<void> {
  const upstream = await fetchScriptRequest(prepared)
  if (!upstream.ok) {
    const text = await upstream.text()
    throw Object.assign(new Error(text || `HTTP ${upstream.status}`), {
      status: upstream.status,
    })
  }
  await consumeScriptStream(runtime, upstream, model, completionId, created, onDelta)
}

// ── Validation (save-time DX) ────────────────────────────────────────────────

export function validateScript(scriptContent: string): ScriptValidation {
  const stripped = stripExports(scriptContent)
  try {
    // Static syntax check without executing top-level code.
    new Function(stripped) // eslint-disable-line no-new-func
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  // Full evaluation catches top-level runtime errors (e.g. missing identifiers).
  try {
    const rt = new ScriptRuntime(`validate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, {
      scriptContent,
      baseUrl: '',
      apiKey: '',
    })
    rt.ensureCompiled()
    rt.dispose()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
