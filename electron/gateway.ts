import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import { send } from './emitter'
import {
  responsesToChat,
  chatToResponsesResponse,
  chatErrorToResponsesError,
  createResponsesMeta,
  ResponsesStreamTranslator,
  consumeSse,
} from './responses-api'
import type { ResponsesMeta } from './responses-api'
import {
  getRuntime,
  fetchScriptRequest,
  consumeScriptStream,
  type PreparedRequest,
  type ScriptDelta,
  type ScriptRuntime,
} from './script-runtime'
import { addCallLog } from './call-log'

export interface ModelEntry {
  id: string
  alias: string
  model: string
  enabled: boolean
}

export interface Provider {
  id: string
  name: string
  enabled: boolean
  adapter: string
  baseUrl: string
  apiKey: string
  scriptContent?: string
  models: ModelEntry[]
  /** How /v1/responses is served: 'auto' tries native first, then chat
   *  translation on 404/405; 'native' never translates; 'translate' never
   *  hits the upstream /responses endpoint. */
  responsesMode?: 'auto' | 'native' | 'translate'
}

let server: ReturnType<typeof Fastify> | null = null
let serverApiKey = ''
let providerState: Provider[] = []

function runtimeFor(provider: Provider): ScriptRuntime {
  return getRuntime(provider.id, {
    scriptContent: provider.scriptContent ?? '',
    baseUrl: provider.baseUrl ?? '',
    apiKey: provider.apiKey ?? '',
  })
}

/** Wrap a script stream-parser result as an OpenAI chat.completion.chunk. */
function buildScriptChunk(
  result: ScriptDelta,
  completionId: string,
  created: number,
  model: string,
): Record<string, unknown> {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: result.delta || {},
        finish_reason: result.finishReason || null,
      },
    ],
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

async function pipeScriptChatStream(
  runtime: ScriptRuntime,
  upstream: Response,
  model: string,
  reply: FastifyReply,
): Promise<void> {
  reply.hijack()
  reply.raw.writeHead(200, SSE_HEADERS)
  const completionId = `chatcmpl-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)
  try {
    await consumeScriptStream(runtime, upstream, model, completionId, created, (result) => {
      reply.raw.write(
        `data: ${JSON.stringify(buildScriptChunk(result, completionId, created, model))}\n\n`,
      )
    })
  } catch {
    // upstream aborted; terminate the response below
  }
  reply.raw.end('data: [DONE]\n\n')
}

async function pipeScriptResponsesStream(
  runtime: ScriptRuntime,
  upstream: Response,
  model: string,
  reply: FastifyReply,
  meta: ResponsesMeta,
): Promise<void> {
  reply.hijack()
  reply.raw.writeHead(200, SSE_HEADERS)
  const completionId = `chatcmpl-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)
  const translator = new ResponsesStreamTranslator(meta)
  try {
    await consumeScriptStream(runtime, upstream, model, completionId, created, (result) => {
      const chunk = buildScriptChunk(result, completionId, created, model)
      reply.raw.write(translator.transform(chunk))
    })
  } catch {
    // upstream aborted; terminate the response below
  }
  reply.raw.write(translator.finalize())
  reply.raw.write('data: [DONE]\n\n')
  reply.raw.end()
}

export function setProviders(providers: Provider[]): void {
  providerState = providers
}

function checkAuth(headers: Record<string, string | string[] | undefined>): void {
  if (!serverApiKey) return
  const auth = headers.authorization ?? headers.Authorization ?? ''
  const value = Array.isArray(auth) ? auth[0] : auth
  if (value !== `Bearer ${serverApiKey}`) {
    const err = new Error('Unauthorized') as Error & { status: number }
    err.status = 401
    throw err
  }
}

function findProviderForModel(
  model: string,
): { provider: Provider; actualModel: string } {
  let providerFilter: string | null = null
  let aliasLookup = model
  const slash = model.lastIndexOf('/')
  if (slash !== -1) {
    const pid = model.slice(0, slash)
    providerFilter = pid.includes(':') ? pid.slice(pid.lastIndexOf(':') + 1) : pid
    aliasLookup = model.slice(slash + 1)
  }

  for (const p of providerState) {
    if (!p.enabled) continue
    if (providerFilter && p.id !== providerFilter) continue
    for (const m of p.models ?? []) {
      if (!m.enabled) continue
      if (m.alias === aliasLookup) {
        return { provider: p, actualModel: m.model || model }
      }
    }
  }
  throw Object.assign(new Error(`Model '${model}' not found`), { status: 404 })
}

async function upstreamRequest(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  reqBody: Record<string, unknown>,
): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, '')}/${endpoint}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(300_000),
  })
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const

async function pipeStream(upstream: Response, reply: FastifyReply): Promise<void> {
  reply.hijack()
  reply.raw.writeHead(upstream.status, SSE_HEADERS)
  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    reply.raw.write(decoder.decode(value, { stream: true }))
  }
  reply.raw.end()
}

// Re-encode an upstream chat-completions SSE stream as Responses SSE events.
async function pipeTranslatedStream(
  upstreamBody: ReadableStream<Uint8Array>,
  reply: FastifyReply,
  meta: ResponsesMeta,
): Promise<void> {
  reply.hijack()
  reply.raw.writeHead(200, SSE_HEADERS)
  const translator = new ResponsesStreamTranslator(meta)
  try {
    await consumeSse(upstreamBody, (data) => {
      if (data === '[DONE]') return
      let chunk: unknown
      try {
        chunk = JSON.parse(data)
      } catch {
        return
      }
      if (!chunk || typeof chunk !== 'object') return
      reply.raw.write(translator.transform(chunk as Record<string, unknown>))
    })
  } catch {
    // upstream stream aborted; terminate the response below
  }
  reply.raw.write(translator.finalize())
  reply.raw.write('data: [DONE]\n\n')
  reply.raw.end()
}

export async function startGateway(
  port: number,
  bindAddress: string,
  apiKey: string,
): Promise<void> {
  if (server) throw new Error('Gateway is already running')

  serverApiKey = apiKey
  const app = Fastify()
  await app.register(cors, { origin: true })

  app.get('/v1/models', async (req, reply) => {
    try {
      checkAuth(req.headers)
      const models: Array<{ id: string; object: string; owned_by: string }> = []
      for (const p of providerState) {
        if (!p.enabled) continue
        const providerId = p.id ?? 'unknown'
        const owner = p.name ?? providerId
        for (const m of p.models ?? []) {
          if (!m.enabled) continue
          if (m.alias) {
            models.push({
              id: `${providerId}/${m.alias}`,
              object: 'model',
              owned_by: owner,
            })
          }
        }
      }
      return { object: 'list', data: models }
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500
      reply.code(status)
      return { error: (e as Error).message }
    }
  })

  app.post('/v1/chat/completions', async (req, reply) => {
    const start = Date.now()
    const ip = req.ip
    const body = (req.body ?? {}) as Record<string, unknown>
    const model = String(body.model ?? '-')
    const isStream = body.stream === true

    try {
      checkAuth(req.headers)

      const modelAlias = String(body.model ?? '')
      if (!modelAlias) {
        throw Object.assign(new Error("Missing 'model' field"), { status: 400 })
      }

      const { provider, actualModel } = findProviderForModel(modelAlias)
      const adapter = provider.adapter ?? ''
      const baseUrl = provider.baseUrl ?? ''
      const providerKey = provider.apiKey ?? ''
      const reqBody: Record<string, unknown> = { ...body, model: actualModel }

      if (adapter === 'script') {
        const runtime = runtimeFor(provider)
        let prepared: PreparedRequest
        try {
          prepared = await runtime.prepareRequest(reqBody)
        } catch (e) {
          throw Object.assign(new Error(`Adapter script error: ${(e as Error).message}`), { status: 502 })
        }
        const upstream = await fetchScriptRequest(prepared)
        if (!upstream.ok) {
          const text = await upstream.text()
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/chat/completions',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: `HTTP ${upstream.status}`,
            stream: isStream,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: text,
          })
          throw Object.assign(new Error(text || `HTTP ${upstream.status}`), { status: upstream.status })
        }
        if (isStream) {
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/chat/completions',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: null,
            stream: true,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: null,
          })
          await pipeScriptChatStream(runtime, upstream, actualModel, reply)
          return reply
        }
        const respBody = runtime.parseResponse(
          await upstream.text(),
          actualModel,
          `chatcmpl-${Date.now()}`,
          Math.floor(Date.now() / 1000),
        )
        addCallLog({
          kind: 'gateway',
          method: 'POST',
          path: '/v1/chat/completions',
          status: upstream.status,
          durationMs: Date.now() - start,
          model,
          tokens: 0,
          ip,
          error: null,
          stream: false,
          requestHeaders: req.headers,
          requestBody: body,
          responseHeaders: Object.fromEntries(upstream.headers.entries()),
          responseBody: respBody,
        })
        reply.code(200)
        return respBody
      }

      if (adapter !== 'openai-compatible') {
        throw Object.assign(new Error(`Adapter '${adapter}' not yet supported by gateway`), { status: 501 })
      }

      const upstream = await upstreamRequest(baseUrl, providerKey, 'chat/completions', reqBody)

      if (isStream) {
        if (!upstream.body) {
          throw Object.assign(new Error('Empty upstream body'), { status: 502 })
        }
        addCallLog({
          kind: 'gateway',
          method: 'POST',
          path: '/v1/chat/completions',
          status: upstream.status,
          durationMs: Date.now() - start,
          model,
          tokens: 0,
          ip,
          error: null,
          stream: true,
          requestHeaders: req.headers,
          requestBody: body,
          responseHeaders: Object.fromEntries(upstream.headers.entries()),
          responseBody: null,
        })
        await pipeStream(upstream, reply)
        return reply
      }

      const json = (await upstream.json()) as unknown
      addCallLog({
        kind: 'gateway',
        method: 'POST',
        path: '/v1/chat/completions',
        status: upstream.status,
        durationMs: Date.now() - start,
        model,
        tokens: 0,
        ip,
        error: null,
        stream: false,
        requestHeaders: req.headers,
        requestBody: body,
        responseHeaders: Object.fromEntries(upstream.headers.entries()),
        responseBody: json,
      })
      reply.code(upstream.status)
      return json
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500
      addCallLog({
        kind: 'gateway',
        method: 'POST',
        path: '/v1/chat/completions',
        status,
        durationMs: Date.now() - start,
        model,
        tokens: 0,
        ip,
        error: (e as Error).message,
        stream: isStream,
        requestHeaders: req.headers,
        requestBody: body,
        responseHeaders: null,
        responseBody: null,
      })
      reply.code(status)
      return { error: (e as Error).message }
    }
  })

  app.post('/v1/responses', async (req, reply) => {
    const start = Date.now()
    const ip = req.ip
    const body = (req.body ?? {}) as Record<string, unknown>
    const model = String(body.model ?? '-')
    const isStream = body.stream === true

    try {
      checkAuth(req.headers)

      const modelAlias = String(body.model ?? '')
      if (!modelAlias) {
        throw Object.assign(new Error("Missing 'model' field"), { status: 400 })
      }

      const { provider, actualModel } = findProviderForModel(modelAlias)
      const adapter = provider.adapter ?? ''
      const baseUrl = provider.baseUrl ?? ''
      const providerKey = provider.apiKey ?? ''
      const responsesMode = provider.responsesMode ?? 'auto'

      if (adapter === 'script') {
        const runtime = runtimeFor(provider)
        const chatBody = responsesToChat(body)
        chatBody.model = actualModel
        chatBody.stream = isStream
        let prepared: PreparedRequest
        try {
          prepared = await runtime.prepareRequest(chatBody)
        } catch (e) {
          throw Object.assign(new Error(`Adapter script error: ${(e as Error).message}`), { status: 502 })
        }
        const meta = createResponsesMeta(modelAlias)
        const upstream = await fetchScriptRequest(prepared)
        if (!upstream.ok) {
          const text = await upstream.text()
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/responses',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: `HTTP ${upstream.status}`,
            stream: isStream,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: text,
          })
          reply.code(upstream.status)
          return chatErrorToResponsesError(upstream.status, text)
        }
        if (isStream) {
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/responses',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: null,
            stream: true,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: null,
          })
          await pipeScriptResponsesStream(runtime, upstream, actualModel, reply, meta)
          return reply
        }
        const parsed = runtime.parseResponse(
          await upstream.text(),
          actualModel,
          `chatcmpl-${Date.now()}`,
          Math.floor(Date.now() / 1000),
        )
        const respBody = chatToResponsesResponse(parsed, meta)
        addCallLog({
          kind: 'gateway',
          method: 'POST',
          path: '/v1/responses',
          status: upstream.status,
          durationMs: Date.now() - start,
          model,
          tokens: 0,
          ip,
          error: null,
          stream: false,
          requestHeaders: req.headers,
          requestBody: body,
          responseHeaders: Object.fromEntries(upstream.headers.entries()),
          responseBody: respBody,
        })
        reply.code(200)
        return respBody
      }

      if (adapter !== 'openai-compatible') {
        throw Object.assign(new Error(`Adapter '${adapter}' does not support the Responses API`), { status: 501 })
      }

      if (responsesMode !== 'translate') {
        const upstream = await upstreamRequest(baseUrl, providerKey, 'responses', { ...body, model: actualModel })
        const unsupported = upstream.status === 404 || upstream.status === 405
        if (responsesMode === 'native' && unsupported) {
          const text = await upstream.text()
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/responses',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: `HTTP ${upstream.status}`,
            stream: isStream,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: text,
          })
          reply.code(upstream.status)
          return { error: { message: text || `Upstream returned HTTP ${upstream.status}`, type: 'invalid_request_error' } }
        }
        if (!unsupported) {
          if (isStream) {
            if (!upstream.body) {
              throw Object.assign(new Error('Empty upstream body'), { status: 502 })
            }
            addCallLog({
              kind: 'gateway',
              method: 'POST',
              path: '/v1/responses',
              status: upstream.status,
              durationMs: Date.now() - start,
              model,
              tokens: 0,
              ip,
              error: null,
              stream: true,
              requestHeaders: req.headers,
              requestBody: body,
              responseHeaders: Object.fromEntries(upstream.headers.entries()),
              responseBody: null,
            })
            await pipeStream(upstream, reply)
            return reply
          }
          const json = (await upstream.json()) as unknown
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/responses',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: null,
            stream: false,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: json,
          })
          reply.code(upstream.status)
          return json
        }
        // 'auto' + endpoint unsupported -> fall through to chat translation
      }

      // Translate Responses request into a chat-completions request
      const chatBody = responsesToChat(body)
      chatBody.model = actualModel
      chatBody.stream = isStream
      const upstream = await upstreamRequest(baseUrl, providerKey, 'chat/completions', chatBody)

      if (isStream) {
        if (!upstream.body) {
          throw Object.assign(new Error('Empty upstream body'), { status: 502 })
        }
        if (upstream.status >= 400) {
          const text = await upstream.text()
          addCallLog({
            kind: 'gateway',
            method: 'POST',
            path: '/v1/responses',
            status: upstream.status,
            durationMs: Date.now() - start,
            model,
            tokens: 0,
            ip,
            error: `HTTP ${upstream.status}`,
            stream: true,
            requestHeaders: req.headers,
            requestBody: body,
            responseHeaders: Object.fromEntries(upstream.headers.entries()),
            responseBody: text,
          })
          reply.code(upstream.status)
          return chatErrorToResponsesError(upstream.status, text)
        }
        addCallLog({
          kind: 'gateway',
          method: 'POST',
          path: '/v1/responses',
          status: upstream.status,
          durationMs: Date.now() - start,
          model,
          tokens: 0,
          ip,
          error: null,
          stream: true,
          requestHeaders: req.headers,
          requestBody: body,
          responseHeaders: Object.fromEntries(upstream.headers.entries()),
          responseBody: null,
        })
        await pipeTranslatedStream(upstream.body, reply, createResponsesMeta(modelAlias))
        return reply
      }

      const json = (await upstream.json()) as unknown
      addCallLog({
        kind: 'gateway',
        method: 'POST',
        path: '/v1/responses',
        status: upstream.status,
        durationMs: Date.now() - start,
        model,
        tokens: 0,
        ip,
        error: null,
        stream: false,
        requestHeaders: req.headers,
        requestBody: body,
        responseHeaders: Object.fromEntries(upstream.headers.entries()),
        responseBody: json,
      })
      if (upstream.status >= 400) {
        reply.code(upstream.status)
        return chatErrorToResponsesError(upstream.status, json)
      }
      reply.code(200)
      return chatToResponsesResponse(json, createResponsesMeta(modelAlias))
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500
      addCallLog({
        kind: 'gateway',
        method: 'POST',
        path: '/v1/responses',
        status,
        durationMs: Date.now() - start,
        model,
        tokens: 0,
        ip,
        error: (e as Error).message,
        stream: isStream,
        requestHeaders: req.headers,
        requestBody: body,
        responseHeaders: null,
        responseBody: null,
      })
      reply.code(status)
      return { error: (e as Error).message }
    }
  })

  await app.listen({ port, host: bindAddress })
  server = app
}

export async function stopGateway(): Promise<void> {
  if (server) {
    await server.close()
    server = null
  }
  serverApiKey = ''
}

export function gatewayStatus(): boolean {
  return server !== null
}

export async function chatCompletion(model: string, messages: unknown[]): Promise<void> {
  const start = Date.now()
  let reqBody: Record<string, unknown> | null = null
  try {
    const { provider, actualModel } = findProviderForModel(model)
    const adapter = provider.adapter ?? ''
    const baseUrl = provider.baseUrl ?? ''
    const providerKey = provider.apiKey ?? ''
    reqBody = { model: actualModel, messages, stream: true }

    if (adapter === 'openai-compatible') {
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (providerKey) headers.Authorization = `Bearer ${providerKey}`
      const upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(300_000),
      })
      if (!upstream.ok) {
        const text = await upstream.text()
        addCallLog({
          kind: 'chat',
          method: 'POST',
          path: '/v1/chat/completions',
          status: upstream.status,
          durationMs: Date.now() - start,
          model,
          tokens: 0,
          ip: '',
          error: `HTTP ${upstream.status}: ${text}`,
          stream: true,
          requestHeaders: null,
          requestBody: reqBody,
          responseHeaders: Object.fromEntries(upstream.headers.entries()),
          responseBody: text,
        })
        send('chat:error', { error: `HTTP ${upstream.status}: ${text}` })
        return
      }
      if (!upstream.body) {
        send('chat:done', {})
        return
      }
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        send('chat:token', { text: decoder.decode(value, { stream: true }) })
      }
      addCallLog({
        kind: 'chat',
        method: 'POST',
        path: '/v1/chat/completions',
        status: 200,
        durationMs: Date.now() - start,
        model,
        tokens: 0,
        ip: '',
        error: null,
        stream: true,
        requestHeaders: null,
        requestBody: reqBody,
        responseHeaders: Object.fromEntries(upstream.headers.entries()),
        responseBody: null,
      })
      send('chat:done', {})
      return
    }

    addCallLog({
      kind: 'chat',
      method: 'POST',
      path: '/v1/chat/completions',
      status: 501,
      durationMs: Date.now() - start,
      model,
      tokens: 0,
      ip: '',
      error: `Adapter '${adapter}' not supported`,
      stream: true,
      requestHeaders: null,
      requestBody: reqBody,
      responseHeaders: null,
      responseBody: null,
    })
    send('chat:error', { error: `Adapter '${adapter}' not supported` })
  } catch (e) {
    addCallLog({
      kind: 'chat',
      method: 'POST',
      path: '/v1/chat/completions',
      status: 500,
      durationMs: Date.now() - start,
      model,
      tokens: 0,
      ip: '',
      error: (e as Error).message,
      stream: true,
      requestHeaders: null,
      requestBody: reqBody,
      responseHeaders: null,
      responseBody: null,
    })
    send('chat:error', { error: (e as Error).message })
  }
}
