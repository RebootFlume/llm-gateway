// Command Code 适配器脚本
// 移植自 commandcode-proxy/proxy.mjs，将 OpenAI chat API 翻译为 Command Code
// /alpha/generate API。接口契约见 docs/adapter-script.md。
//
// 运行环境：网关主进程常驻沙箱，模块级状态跨请求持久。
//
// env  = { baseUrl, apiKey }
// http = { get(url, headers), post(url, headers, body) }
//        异步函数（需 await），返回 { ok, status, body, text }

export const meta = {
  defaultBaseUrl: 'https://api.commandcode.ai',
  description: 'Command Code CLI API adapter',
}

// ── 常量 ────────────────────────────────────────────
const CC_VERSION = '0.32.3'
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000
const SESSION_JITTER_MS = 60 * 60 * 1000
const INIT_REFRESH_MS = 8 * 60 * 60 * 1000
const INIT_JITTER_MS = 2 * 60 * 60 * 1000

// ── 状态（跨请求持久）──────────────────────────────
const sessionStore = new Map()   // apiKey -> { sessionId, expiresAt }
const keyStateStore = new Map()  // apiKey -> { fingerprint, nextInitAt }

// ── 工具函数 ────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function randHex(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += ((Math.random() * 16) | 0).toString(16)
  return s
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0]
}

function tryParseJSON(str) {
  try { return JSON.parse(str) } catch { return {} }
}

function getDateStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── 指纹（模拟真实 CLI 设备，避免被风控识别为脚本）──

const FINGERPRINT_CPUS = [
  { model: '12th Gen Intel(R) Core(TM) i7-12650H', cores: 10 },
  { model: '12th Gen Intel(R) Core(TM) i5-12400F', cores: 6 },
  { model: '13th Gen Intel(R) Core(TM) i7-13700K', cores: 16 },
  { model: '13th Gen Intel(R) Core(TM) i5-13600K', cores: 14 },
  { model: 'AMD Ryzen 7 7800X3D', cores: 8 },
  { model: 'AMD Ryzen 9 7950X', cores: 16 },
  { model: 'AMD Ryzen 5 7600', cores: 6 },
]
const FINGERPRINT_MEMS = [8, 16, 24, 32, 48, 64]
const FINGERPRINT_TZS = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Singapore', 'Asia/Seoul', 'Asia/Hong_Kong',
]

function generateFingerprint() {
  const cpu = pick(FINGERPRINT_CPUS)
  const memGiB = pick(FINGERPRINT_MEMS)
  const tz = pick(FINGERPRINT_TZS)
  const macCount = 2 + ((Math.random() * 4) | 0)

  const macHashes = []
  for (let i = 0; i < macCount; i++) macHashes.push(randHex(64))

  return {
    thumbmark: randHex(64),
    components: {
      machineIdHash: randHex(64),
      macHashes,
      osUserHash: randHex(64),
      hostnameHash: randHex(64),
      gitEmailHash: randHex(64),
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.22631',
      cpuModel: cpu.model,
      cpuCount: cpu.cores,
      memGiB,
      isContainer: false,
      timezone: tz,
      runtime: 'cli',
      collectorVersion: 1,
    },
  }
}

// ── 会话（复用，12h + 抖动过期）────────────────────

function ensureSession(apiKey) {
  const now = Date.now()
  const entry = sessionStore.get(apiKey)
  if (entry && now < entry.expiresAt) return entry.sessionId

  const sessionId = uuid()
  const jitter = (Math.random() * SESSION_JITTER_MS) | 0
  sessionStore.set(apiKey, {
    sessionId,
    expiresAt: now + SESSION_DURATION_MS + jitter,
  })
  return sessionId
}

// ── 密钥状态（指纹 + 初始化节流）──────────────────

function getOrCreateKeyState(apiKey) {
  let state = keyStateStore.get(apiKey)
  if (!state) {
    state = { fingerprint: generateFingerprint(), nextInitAt: 0 }
    keyStateStore.set(apiKey, state)
  }
  return state
}

// ── 预检：指纹登记 + 生命周期（异步、失败重试）────

function buildAuthHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'x-cli-environment': 'production',
    'Authorization': 'Bearer ' + env.apiKey,
    'x-command-code-version': CC_VERSION,
  }
}

async function ensureInitialized(env, http) {
  const state = getOrCreateKeyState(env.apiKey)
  if (Date.now() < state.nextInitAt) return

  const headers = buildAuthHeaders(env)
  const fp = state.fingerprint

  // 指纹登记：失败则不推进节流，下次请求重试；不阻塞主请求
  const record = await http.post(env.baseUrl + '/alpha/fingerprint/record', headers, fp)
  if (!record.ok) {
    console.warn('[commandcode] fingerprint record failed:', record.status)
    return
  }

  // 生命周期事件：尽力而为，失败不影响主流程
  const lifecycle = await http.post(env.baseUrl + '/alpha/lifecycle-events', headers, {
    eventType: 'cli_session_exists',
    metadata: {
      sessionId: 'sess_' + randHex(8),
      cliVersion: CC_VERSION,
      mode: 'interactive',
      os: fp.components.platform + '-' + fp.components.arch,
    },
  })
  if (!lifecycle.ok) {
    console.warn('[commandcode] lifecycle event failed:', lifecycle.status)
  }

  const jitter = (Math.random() * INIT_JITTER_MS) | 0
  state.nextInitAt = Date.now() + INIT_REFRESH_MS + jitter
}

// ── 请求头 ──────────────────────────────────────────

function fakeProjectSlug(sessionId) {
  const names = ['app', 'api', 'backend', 'cli', 'core', 'data', 'frontend',
    'lib', 'plugin', 'proxy', 'server', 'service', 'tool', 'web', 'worker']
  const name = names[parseInt(sessionId.slice(0, 4), 16) % names.length]
  const suffix = sessionId.slice(0, 4)
  const path = '/home/dev/projects/' + name + '-' + suffix
  return path
    .toLowerCase()
    .replace(/^[a-z]:/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function generateTraceparent() {
  return '00-' + randHex(32) + '-' + randHex(16) + '-01'
}

function buildRequestHeaders(env, sessionId) {
  const headers = buildAuthHeaders(env)
  headers['x-session-id'] = sessionId
  headers['x-co-flag'] = 'false'
  headers['x-taste-learning'] = 'false'
  headers['x-project-slug'] = fakeProjectSlug(sessionId)
  headers['traceparent'] = generateTraceparent()
  return headers
}

// ── OpenAI -> CC 消息转换 ───────────────────────────

function convertUserMessage(msg) {
  const content = msg.content
  if (typeof content === 'string') {
    return { role: 'user', content: [{ type: 'text', text: content }] }
  }
  if (Array.isArray(content)) {
    const parts = content.map((part) =>
      part.type === 'image_url'
        ? { type: 'image', image: (part.image_url && part.image_url.url) || '' }
        : part,
    )
    return { role: 'user', content: parts }
  }
  return { role: 'user', content: [{ type: 'text', text: String(content) }] }
}

function convertAssistantMessage(msg) {
  const parts = []
  if (typeof msg.content === 'string' && msg.content) {
    parts.push({ type: 'text', text: msg.content })
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') parts.push(part)
    }
  }
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      parts.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: (tc.function && tc.function.name) || '',
        input: typeof (tc.function && tc.function.arguments) === 'string'
          ? tryParseJSON(tc.function.arguments)
          : (tc.function && tc.function.arguments) || {},
      })
    }
  }
  return { role: 'assistant', content: parts }
}

function convertToolMessage(msg, toolNameMap) {
  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: msg.tool_call_id,
      toolName: toolNameMap[msg.tool_call_id] || msg.name || '',
      output: {
        type: 'text',
        value: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      },
    }],
  }
}

function convertMessage(msg, toolNameMap) {
  if (msg.role === 'user') return convertUserMessage(msg)
  if (msg.role === 'assistant') return convertAssistantMessage(msg)
  if (msg.role === 'tool') return convertToolMessage(msg, toolNameMap)
  return msg // 其他角色原样透传
}

function buildCcRequest(openaiReq) {
  const messages = Array.isArray(openaiReq.messages) ? openaiReq.messages : []
  const max_tokens = openaiReq.max_tokens
  const temperature = openaiReq.temperature
  const tools = openaiReq.tools
  const reasoning_effort = openaiReq.reasoning_effort
  const tool_choice = openaiReq.tool_choice
  const parallel_tool_calls = openaiReq.parallel_tool_calls

  // 单遍：抽 system 提示、维护 tool_call_id -> 工具名映射、转换消息
  let systemPrompt = ''
  const toolNameMap = {}
  const ccMessages = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content
      continue
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) toolNameMap[tc.id] = (tc.function && tc.function.name) || ''
      }
    }
    ccMessages.push(convertMessage(msg, toolNameMap))
  }

  const body = {
    config: {
      workingDir: '/home/dev/projects/app',
      date: getDateStr(),
      environment: 'win32-x64',
      structure: [],
      isGitRepo: false,
      currentBranch: '',
      mainBranch: '',
      gitStatus: '',
      recentCommits: [],
    },
    memory: null,
    taste: null,
    skills: '',
    permissionMode: 'standard',
    params: {
      model: openaiReq.model || DEFAULT_MODEL,
      messages: ccMessages,
      max_tokens: Math.min(max_tokens || 64000, 200000),
      stream: true,
    },
  }

  if (systemPrompt) body.params.system = systemPrompt
  if (temperature !== undefined) body.params.temperature = temperature
  if (reasoning_effort !== undefined) body.params.reasoning_effort = reasoning_effort

  if (tools && tools.length > 0) {
    body.params.tools = tools.map((t) => ({
      type: t.type || 'function',
      name: (t.function && t.function.name) || t.name || '',
      description: (t.function && t.function.description) || t.description || '',
      input_schema: (t.function && t.function.parameters) || t.input_schema || { type: 'object', properties: {} },
    }))
  }

  if (tool_choice !== undefined) {
    if (typeof tool_choice === 'string') {
      const map = { auto: 'auto', none: 'none', required: 'any' }
      body.params.tool_choice = { type: map[tool_choice] || 'auto' }
    } else if (tool_choice.type === 'function') {
      body.params.tool_choice = { type: 'tool', name: tool_choice.function && tool_choice.function.name }
    } else {
      body.params.tool_choice = tool_choice
    }
  }

  if (parallel_tool_calls !== undefined) {
    body.params.parallel_tool_calls = parallel_tool_calls
  }

  return body
}

// ── prepareRequest ───────────────────────────────────

export async function prepareRequest(openaiReq, env, http) {
  await ensureInitialized(env, http)
  const sessionId = ensureSession(env.apiKey)

  return {
    url: env.baseUrl + '/alpha/generate',
    method: 'POST',
    headers: buildRequestHeaders(env, sessionId),
    body: buildCcRequest(openaiReq),
  }
}

// ── 流式解析：CC NDJSON -> OpenAI delta ─────────────

function mapFinishReason(reason) {
  switch (reason) {
    case 'tool-calls': return 'tool_calls'
    case 'length': return 'length'
    case 'stop': return 'stop'
    default: return reason || 'stop'
  }
}

export function createStreamParser(_model, _completionId, _created) {
  let chunkIndex = 0
  let toolCallIndex = 0
  let finishReason = null
  let usage = null

  function parseLine(line) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '[DONE]' || trimmed.charAt(0) === ':') return null

    let event
    try { event = JSON.parse(trimmed) } catch { return null }
    if (!event.type) return null

    switch (event.type) {
      case 'text-delta': {
        const text = event.text || event.delta || ''
        if (!text) return null
        const delta = chunkIndex === 0
          ? { role: 'assistant', content: text }
          : { content: text }
        chunkIndex++
        return { delta }
      }

      case 'reasoning-delta': {
        const text = event.text || ''
        if (!text) return null
        const delta = chunkIndex === 0
          ? { role: 'assistant', reasoning_content: text }
          : { reasoning_content: text }
        chunkIndex++
        return { delta }
      }

      case 'tool-call': {
        const id = event.toolCallId || ('call_' + Date.now() + '_' + toolCallIndex)
        const name = event.toolName || ''
        const args = typeof event.input === 'string' ? event.input : JSON.stringify(event.input || {})
        const tcEntry = {
          index: toolCallIndex,
          id,
          type: 'function',
          function: { name, arguments: args },
        }
        const delta = chunkIndex === 0
          ? { role: 'assistant', content: null, tool_calls: [tcEntry] }
          : { tool_calls: [tcEntry] }
        chunkIndex++
        toolCallIndex++
        return { delta }
      }

      case 'finish-step': {
        if (event.finishReason) finishReason = mapFinishReason(event.finishReason)
        if (event.usage) usage = event.usage
        return null
      }

      case 'finish': {
        const fr = finishReason || mapFinishReason(event.finishReason || 'stop')
        const u = event.totalUsage || usage || {}
        const ot = Number(u.outputTokens)
        if (!ot) { u.inputTokens = 0; u.cachedInputTokens = 0 }
        const openaiUsage = {
          prompt_tokens: u.inputTokens || 0,
          completion_tokens: u.outputTokens || 0,
          total_tokens: (u.inputTokens || 0) + (u.outputTokens || 0),
          prompt_tokens_details: { cached_tokens: u.cachedInputTokens || 0 },
        }
        return { delta: {}, finishReason: fr, usage: openaiUsage }
      }

      case 'error':
        return null

      default:
        return null
    }
  }

  return { parseLine }
}

// ── parseResponse：非流式（复用流式解析器聚合）────

export function parseResponse(rawBody, model, completionId, created) {
  const parser = createStreamParser(model, completionId, created)
  const lines = rawBody.split('\n')
  let content = ''
  let reasoningContent = ''
  let toolCalls = null
  let finishReason = 'stop'
  let usage = null

  for (const line of lines) {
    const result = parser.parseLine(line)
    if (!result) continue
    if (result.delta && result.delta.content) content += result.delta.content
    if (result.delta && result.delta.reasoning_content) reasoningContent += result.delta.reasoning_content
    if (result.delta && result.delta.tool_calls) {
      if (!toolCalls) toolCalls = []
      for (const tc of result.delta.tool_calls) toolCalls.push(tc)
    }
    if (result.finishReason) finishReason = result.finishReason
    if (result.usage) usage = result.usage
  }

  const message = { role: 'assistant', content: content || null }
  if (toolCalls) message.tool_calls = toolCalls
  if (reasoningContent) message.reasoning_content = reasoningContent

  return {
    id: completionId,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ── listModels ───────────────────────────────────────

export async function listModels(env, http) {
  const r = await http.get(env.baseUrl + '/provider/v1/models', buildAuthHeaders(env))
  if (!r.ok) return []
  let body = r.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return [] } }
  if (!body || !body.data || !Array.isArray(body.data)) return []
  return body.data.map((m) => ({ id: m.id }))
}
