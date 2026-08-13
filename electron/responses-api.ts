// Responses API <-> chat completions translation.
//
// Lets the gateway serve POST /v1/responses through providers that speak the
// chat completions format (openai-compatible upstreams and script adapters),
// in addition to native /responses passthrough. The translation layer:
//
//   responsesToChat            Responses request  -> chat completions request
//   chatToResponsesResponse    chat response JSON -> Responses response JSON
//   ResponsesStreamTranslator  chat chunks        -> Responses SSE events
//
// Features without a chat-completions equivalent (built-in tools such as
// web_search/code_interpreter/file_search, store/previous_response_id, audio)
// are either rejected or dropped, never silently mis-mapped.

export type Json = Record<string, unknown>

export interface ResponsesMeta {
  id: string
  model: string
  createdAt: number
}

export function createResponsesId(): string {
  return `resp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function createResponsesMeta(model: string, createdAt?: number): ResponsesMeta {
  return {
    id: createResponsesId(),
    model,
    createdAt: createdAt ?? Math.floor(Date.now() / 1000),
  }
}

// ── Request: Responses -> chat completions ────────────────────────────────

export function responsesToChat(body: Json): Json {
  const messages: Json[] = []
  const instructions = body.instructions
  if (typeof instructions === 'string' && instructions.length > 0) {
    messages.push({ role: 'system', content: instructions })
  }
  for (const item of normalizeInput(body.input)) messages.push(item)

  const chat: Json = { model: body.model, messages }
  if (typeof body.stream === 'boolean') chat.stream = body.stream

  for (const key of ['temperature', 'top_p', 'user', 'seed', 'stop'] as const) {
    if (body[key] !== undefined) chat[key] = body[key]
  }
  if (body.max_output_tokens !== undefined) chat.max_tokens = body.max_output_tokens

  const tools = normalizeTools(body.tools)
  if (tools !== undefined) chat.tools = tools
  const toolChoice = normalizeToolChoice(body.tool_choice)
  if (toolChoice !== undefined) chat.tool_choice = toolChoice
  if (typeof body.parallel_tool_calls === 'boolean') chat.parallel_tool_calls = body.parallel_tool_calls

  const text = body.text
  if (text && typeof text === 'object') {
    const responseFormat = normalizeResponseFormat((text as Json).format)
    if (responseFormat !== undefined) chat.response_format = responseFormat
  }
  const reasoning = body.reasoning
  if (reasoning && typeof reasoning === 'object') {
    const effort = (reasoning as Json).effort
    if (typeof effort === 'string') chat.reasoning_effort = effort
  }

  return chat
}

function normalizeInput(input: unknown): Json[] {
  if (input === undefined || input === null) return []
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  if (!Array.isArray(input)) return []

  const out: Json[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Json
    const type = typeof item.type === 'string' ? item.type : ''

    if (type === 'function_call') {
      const id = typeof item.call_id === 'string' && item.call_id ? item.call_id : `call_${out.length}`
      out.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id,
            type: 'function',
            function: {
              name: typeof item.name === 'string' ? item.name : '',
              arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
            },
          },
        ],
      })
      continue
    }

    if (type === 'function_call_output') {
      const outputValue = item.output
      out.push({
        role: 'tool',
        tool_call_id: typeof item.call_id === 'string' ? item.call_id : '',
        content: typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue ?? ''),
      })
      continue
    }

    if (type === 'reasoning') continue // reasoning traces are not replayed

    if (type === 'message' || type === '' || typeof item.role === 'string') {
      const role = typeof item.role === 'string' ? item.role : 'user'
      if (role !== 'user' && role !== 'assistant' && role !== 'system') continue
      const msg: Json = { role, content: normalizeMessageContent(item.content) }
      if (typeof item.name === 'string') msg.name = item.name
      out.push(msg)
    }
  }
  return out
}

function normalizeMessageContent(content: unknown): null | string | Json[] {
  if (content === undefined || content === null) return null
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content)

  const parts: Json[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const part = raw as Json
    const type = typeof part.type === 'string' ? part.type : ''

    if (type === 'input_text' || type === 'output_text' || type === 'text') {
      if (typeof part.text === 'string') parts.push({ type: 'text', text: part.text })
    } else if (type === 'image_url' || type === 'input_image') {
      const image = part.image_url
      if (typeof image === 'string') {
        parts.push({ type: 'image_url', image_url: { url: image } })
      } else if (image && typeof image === 'object' && typeof (image as Json).url === 'string') {
        const url = (image as Json).url as string
        const detail = (image as Json).detail
        parts.push({ type: 'image_url', image_url: typeof detail === 'string' ? { url, detail } : { url } })
      }
    } else if (type === 'input_audio') {
      const audio = part.input_audio
      if (
        audio &&
        typeof audio === 'object' &&
        typeof (audio as Json).data === 'string' &&
        typeof (audio as Json).format === 'string'
      ) {
        parts.push({ type: 'input_audio', input_audio: audio })
      }
    }
    // Other part types (output_audio, refusal, ...) are dropped.
  }
  return parts
}

function normalizeTools(tools: unknown): Json[] | undefined {
  if (tools === undefined || tools === null) return undefined
  if (!Array.isArray(tools)) return undefined

  const out: Json[] = []
  for (const raw of tools) {
    if (!raw || typeof raw !== 'object') continue
    const tool = raw as Json
    const type = typeof tool.type === 'string' ? tool.type : ''

    if (type === 'function') {
      // Responses API puts name/description/parameters/strict at the top level;
      // tolerate the nested chat-completions form as well.
      const fn = tool.function && typeof tool.function === 'object' ? (tool.function as Json) : tool
      const chatFn: Json = { name: typeof fn.name === 'string' ? fn.name : '' }
      if (typeof fn.description === 'string') chatFn.description = fn.description
      if (fn.parameters && typeof fn.parameters === 'object') chatFn.parameters = fn.parameters
      if (typeof fn.strict === 'boolean') chatFn.strict = fn.strict
      out.push({ type: 'function', function: chatFn })
      continue
    }

    if (type === 'web_search' || type === 'code_interpreter' || type === 'file_search') {
      throw Object.assign(
        new Error(
          `Built-in tool '${type}' has no chat-completions equivalent; use a provider with native /responses support`,
        ),
        { status: 501 },
      )
    }
  }
  return out
}

function normalizeToolChoice(toolChoice: unknown): unknown {
  if (toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return toolChoice
  if (toolChoice && typeof toolChoice === 'object') {
    const tc = toolChoice as Json
    if (tc.type === 'function' && typeof tc.name === 'string') {
      return { type: 'function', function: { name: tc.name } }
    }
  }
  return undefined
}

function normalizeResponseFormat(format: unknown): unknown {
  if (format === undefined || format === null || format === 'text') return undefined
  if (format === 'json_object') return { type: 'json_object' }
  if (typeof format !== 'object') return undefined

  const f = format as Json
  if (f.type === 'json_object') return { type: 'json_object' }
  if (f.type === 'json_schema') {
    // Responses API: name/schema/strict at top level; tolerate nested chat form
    const nested = f.json_schema && typeof f.json_schema === 'object' ? (f.json_schema as Json) : f
    const name = typeof nested.name === 'string' ? nested.name : ''
    const schema = nested.schema
    if (name && schema && typeof schema === 'object') {
      const jsonSchema: Json = { name, schema }
      if (typeof nested.strict === 'boolean') jsonSchema.strict = nested.strict
      return { type: 'json_schema', json_schema: jsonSchema }
    }
  }
  return undefined
}

// ── Response: chat completions -> Responses JSON ──────────────────────────

function mapChatUsage(usage: unknown): Json {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Json
  const prompt = Number(u.prompt_tokens ?? 0)
  const completion = Number(u.completion_tokens ?? 0)
  const promptDetails = (u.prompt_tokens_details ?? {}) as Json
  const completionDetails = (u.completion_tokens_details ?? {}) as Json
  return {
    input_tokens: prompt,
    input_tokens_details: { cached_tokens: Number(promptDetails.cached_tokens ?? 0) },
    output_tokens: completion,
    output_tokens_details: { reasoning_tokens: Number(completionDetails.reasoning_tokens ?? 0) },
    total_tokens: Number(u.total_tokens ?? prompt + completion),
  }
}

export function chatToResponsesResponse(chat: unknown, meta: ResponsesMeta): Json {
  const c = (chat && typeof chat === 'object' ? chat : {}) as Json
  const choice = ((c.choices as Json[] | undefined) ?? [])[0] as Json | undefined
  const message = (choice?.message ?? {}) as Json
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'stop'

  const output: Json[] = []
  let outputText = ''
  let reasoningText = ''

  if (typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0) {
    reasoningText = message.reasoning_content
    output.push({
      id: `rs_${meta.id}`,
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: reasoningText }],
      content: [],
    })
  }

  const contentParts: Json[] = []
  const content = message.content
  if (Array.isArray(content)) {
    for (const raw of content) {
      if (!raw || typeof raw !== 'object') continue
      const part = raw as Json
      if (part.type === 'text' && typeof part.text === 'string') {
        contentParts.push({ type: 'output_text', text: part.text, annotations: [] })
        outputText += part.text
      } else if (part.type === 'image_url' && part.image_url && typeof (part.image_url as Json).url === 'string') {
        contentParts.push({ type: 'output_image', image_url: (part.image_url as Json).url as string })
      }
    }
  } else if (typeof content === 'string') {
    contentParts.push({ type: 'output_text', text: content, annotations: [] })
    outputText = content
  }
  if (contentParts.length > 0) {
    output.push({
      id: `msg_${meta.id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: contentParts,
    })
  }

  const toolCalls = message.tool_calls as Json[] | undefined
  if (Array.isArray(toolCalls)) {
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i] as Json
      const fn = (tc.function ?? {}) as Json
      const id = typeof tc.id === 'string' && tc.id ? tc.id : `call_${meta.id}_${i}`
      output.push({
        id: `fc_${id}`,
        type: 'function_call',
        status: 'completed',
        call_id: id,
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
      })
    }
  }

  const incomplete = finishReason === 'length'
  return {
    id: meta.id,
    object: 'response',
    created_at: meta.createdAt,
    status: incomplete ? 'incomplete' : 'completed',
    error: null,
    incomplete_details: incomplete ? { reason: 'max_output_tokens' } : null,
    instructions: null,
    max_output_tokens: null,
    model: meta.model,
    output,
    output_text: outputText,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: reasoningText ? [{ type: 'summary_text', text: reasoningText }] : [] },
    store: false,
    temperature: null,
    text: { format: { type: 'text' } },
    tool_choice: null,
    tools: [],
    top_p: null,
    truncation: null,
    usage: mapChatUsage(c.usage),
    user: null,
    metadata: {},
  }
}

export function chatErrorToResponsesError(status: number, body: unknown): Json {
  const err = body && typeof body === 'object' ? (body as Json).error : undefined
  if (err && typeof err === 'object') {
    const e = err as Json
    return {
      error: {
        message: typeof e.message === 'string' ? e.message : 'Upstream error',
        type: typeof e.type === 'string' ? e.type : 'invalid_request_error',
        ...(typeof e.code === 'string' ? { code: e.code } : {}),
        ...(typeof e.param === 'string' ? { param: e.param } : {}),
      },
    }
  }
  return {
    error: {
      message: typeof body === 'string' && body ? body : `Upstream returned HTTP ${status}`,
      type: 'invalid_request_error',
    },
  }
}

// ── Stream: chat chunks -> Responses SSE events ───────────────────────────

export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  let inEvent = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline === -1) break
      let line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
        inEvent = true
      } else if (line === '') {
        if (inEvent) {
          onEvent(dataLines.join('\n'))
          dataLines = []
          inEvent = false
        }
      }
    }
  }
  if (dataLines.length > 0) onEvent(dataLines.join('\n'))
}

interface PendingToolCall {
  id: string
  name: string
  args: string
  outputIndex: number
}

export class ResponsesStreamTranslator {
  private readonly meta: ResponsesMeta
  private readonly output: Json[] = []
  private readonly toolCalls = new Map<number, PendingToolCall>()
  private started = false
  private finished = false
  private startedMessage = false
  private messageItemId = ''
  private messageOutputIndex = -1
  private textAccum = ''
  private reasoningItemId = ''
  private reasoningOutputIndex = -1
  private reasoningAccum = ''
  private nextToolCallIndex = 0
  private usage: unknown

  constructor(meta: ResponsesMeta) {
    this.meta = meta
  }

  private response(status: string): Json {
    return {
      id: this.meta.id,
      object: 'response',
      created_at: this.meta.createdAt,
      status,
      model: this.meta.model,
      output: this.output,
      ...(this.usage ? { usage: mapChatUsage(this.usage) } : {}),
    }
  }

  private ensureStarted(): string {
    if (this.started) return ''
    this.started = true
    return (
      `data: ${JSON.stringify({ type: 'response.created', response: this.response('in_progress') })}\n\n` +
      `data: ${JSON.stringify({ type: 'response.in_progress', response: this.response('in_progress') })}\n\n`
    )
  }

  private beginMessage(): string {
    this.startedMessage = true
    this.messageOutputIndex = this.output.length
    this.messageItemId = `msg_${this.meta.id}_${this.messageOutputIndex}`
    const item: Json = {
      id: this.messageItemId,
      type: 'message',
      status: 'in_progress',
      role: 'assistant',
      content: [{ type: 'output_text', text: '', annotations: [], status: 'in_progress' }],
    }
    this.output.push(item)
    const part = (item.content as Json[])[0]
    return (
      `data: ${JSON.stringify({ type: 'response.output_item.added', output_index: this.messageOutputIndex, item })}\n\n` +
      `data: ${JSON.stringify({ type: 'response.content_part.added', item_id: this.messageItemId, output_index: this.messageOutputIndex, content_index: 0, part })}\n\n`
    )
  }

  private beginReasoning(): string {
    this.reasoningOutputIndex = this.output.length
    this.reasoningItemId = `rs_${this.meta.id}_${this.reasoningOutputIndex}`
    const item: Json = {
      id: this.reasoningItemId,
      type: 'reasoning',
      status: 'in_progress',
      summary: [],
      content: [{ type: 'reasoning_text', text: '', status: 'in_progress' }],
    }
    this.output.push(item)
    return `data: ${JSON.stringify({ type: 'response.output_item.added', output_index: this.reasoningOutputIndex, item })}\n\n`
  }

  transform(chunk: Json): string {
    const choice = (chunk.choices as Json[] | undefined)?.[0]
    const delta = (choice?.delta ?? {}) as Json

    if (typeof chunk.usage === 'object' && chunk.usage !== null) this.usage = chunk.usage

    let out = this.ensureStarted()

    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
      if (!this.reasoningItemId) out += this.beginReasoning()
      this.reasoningAccum += delta.reasoning_content
      out += `data: ${JSON.stringify({
        type: 'response.reasoning_text.delta',
        item_id: this.reasoningItemId,
        output_index: this.reasoningOutputIndex,
        content_index: 0,
        delta: delta.reasoning_content,
      })}\n\n`
    }

    const content = delta.content
    if (Array.isArray(content)) {
      for (const raw of content) {
        if (!raw || typeof raw !== 'object') continue
        const part = raw as Json
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          if (!this.startedMessage) out += this.beginMessage()
          this.textAccum += part.text
          out += `data: ${JSON.stringify({
            type: 'response.output_text.delta',
            item_id: this.messageItemId,
            output_index: this.messageOutputIndex,
            content_index: 0,
            delta: part.text,
          })}\n\n`
        }
      }
    } else if (typeof content === 'string' && content.length > 0) {
      if (!this.startedMessage) out += this.beginMessage()
      this.textAccum += content
      out += `data: ${JSON.stringify({
        type: 'response.output_text.delta',
        item_id: this.messageItemId,
        output_index: this.messageOutputIndex,
        content_index: 0,
        delta: content,
      })}\n\n`
    }

    const toolCalls = delta.tool_calls as Json[] | undefined
    if (Array.isArray(toolCalls)) {
      for (const raw of toolCalls) {
        if (!raw || typeof raw !== 'object') continue
        const tc = raw as Json
        const index = typeof tc.index === 'number' ? tc.index : 0
        const fn = (tc.function ?? {}) as Json
        let pending = this.toolCalls.get(index)
        if (!pending) {
          const id = typeof tc.id === 'string' && tc.id ? tc.id : `call_${this.meta.id}_${index}`
          const name = typeof fn.name === 'string' ? fn.name : ''
          const outputIndex = this.nextToolCallIndex++
          pending = { id, name, args: '', outputIndex }
          this.toolCalls.set(index, pending)
          this.output.push({
            id,
            type: 'function_call',
            status: 'in_progress',
            call_id: id,
            name,
            arguments: '',
          })
          out += `data: ${JSON.stringify({
            type: 'response.output_item.added',
            output_index: outputIndex,
            item: { id, type: 'function_call', status: 'in_progress', call_id: id, name, arguments: '' },
          })}\n\n`
        }
        const args = typeof fn.arguments === 'string' ? fn.arguments : ''
        if (args) {
          pending.args += args
          out += `data: ${JSON.stringify({
            type: 'response.function_call_arguments.delta',
            item_id: pending.id,
            output_index: pending.outputIndex,
            delta: args,
          })}\n\n`
        }
      }
    }

    if (typeof choice?.finish_reason === 'string' && choice.finish_reason !== '') {
      out += this.finish(choice.finish_reason)
    }
    return out
  }

  finalize(): string {
    if (!this.started) {
      const empty: Json = {
        id: this.meta.id,
        object: 'response',
        created_at: this.meta.createdAt,
        status: 'completed',
        model: this.meta.model,
        output: [],
        ...(this.usage ? { usage: mapChatUsage(this.usage) } : {}),
      }
      return (
        `data: ${JSON.stringify({ type: 'response.created', response: empty })}\n\n` +
        `data: ${JSON.stringify({ type: 'response.completed', response: empty })}\n\n`
      )
    }
    return this.finish('stop')
  }

  private finish(finishReason: string): string {
    if (this.finished) return ''
    this.finished = true
    let out = ''

    if (this.reasoningItemId) {
      out += `data: ${JSON.stringify({
        type: 'response.reasoning_text.done',
        item_id: this.reasoningItemId,
        output_index: this.reasoningOutputIndex,
        content_index: 0,
        text: this.reasoningAccum,
      })}\n\n`
    }
    if (this.messageItemId) {
      out += `data: ${JSON.stringify({
        type: 'response.output_text.done',
        item_id: this.messageItemId,
        output_index: this.messageOutputIndex,
        content_index: 0,
        text: this.textAccum,
      })}\n\n`
      out += `data: ${JSON.stringify({
        type: 'response.content_part.done',
        item_id: this.messageItemId,
        output_index: this.messageOutputIndex,
        content_index: 0,
        part: { type: 'output_text', text: this.textAccum, annotations: [], status: 'completed' },
      })}\n\n`
    }
    for (const pending of this.toolCalls.values()) {
      out += `data: ${JSON.stringify({
        type: 'response.function_call_arguments.done',
        item_id: pending.id,
        output_index: pending.outputIndex,
        arguments: pending.args,
      })}\n\n`
    }

    if (this.reasoningItemId) {
      out += `data: ${JSON.stringify({
        type: 'response.output_item.done',
        output_index: this.reasoningOutputIndex,
        item: {
          id: this.reasoningItemId,
          type: 'reasoning',
          status: 'completed',
          summary: [],
          content: [{ type: 'reasoning_text', text: this.reasoningAccum }],
        },
      })}\n\n`
    }
    if (this.messageItemId) {
      out += `data: ${JSON.stringify({
        type: 'response.output_item.done',
        output_index: this.messageOutputIndex,
        item: {
          id: this.messageItemId,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: this.textAccum, annotations: [], status: 'completed' }],
        },
      })}\n\n`
    }
    for (const pending of this.toolCalls.values()) {
      out += `data: ${JSON.stringify({
        type: 'response.output_item.done',
        output_index: pending.outputIndex,
        item: {
          id: pending.id,
          type: 'function_call',
          status: 'completed',
          call_id: pending.id,
          name: pending.name,
          arguments: pending.args,
        },
      })}\n\n`
    }

    const status = finishReason === 'length' ? 'incomplete' : 'completed'
    out += `data: ${JSON.stringify({ type: 'response.completed', response: this.response(status) })}\n\n`
    return out
  }
}
