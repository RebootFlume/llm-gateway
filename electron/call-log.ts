import { send } from './emitter'

/**
 * In-memory call log for model-inference calls (chat + gateway proxy). Kept in
 * main-process memory (lost on restart by design), capped at MAX_LOGS entries.
 * Each entry carries the full request/response wire content so the UI can show
 * a complete detail view.
 */

export type CallLogKind = 'chat' | 'gateway'

export interface CallLogEntry {
  id: string
  timestamp: number
  kind: CallLogKind
  method: string
  path: string
  status: number
  durationMs: number
  model: string
  tokens: number
  ip: string
  error: string | null
  stream: boolean
  requestHeaders: Record<string, string> | null
  requestBody: string | null
  responseHeaders: Record<string, string> | null
  responseBody: string | null
  truncated: boolean
}

export interface CallLogInput {
  kind: CallLogKind
  method: string
  path: string
  status: number
  durationMs: number
  model: string
  tokens: number
  ip: string
  error: string | null
  stream: boolean
  requestHeaders: Record<string, string | string[] | undefined> | null
  requestBody: unknown
  responseHeaders: Record<string, string | string[] | undefined> | null
  responseBody: unknown
}

const MAX_LOGS = 500
const MAX_BODY_CHARS = 200_000

const logs: CallLogEntry[] = []
let logIdCounter = 0

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined> | null,
): Record<string, string> | null {
  if (!headers) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
  }
  return out
}

function stringifyBody(value: unknown): { text: string | null; truncated: boolean } {
  if (value === undefined || value === null) return { text: null, truncated: false }
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  if (s.length > MAX_BODY_CHARS) {
    return { text: s.slice(0, MAX_BODY_CHARS), truncated: true }
  }
  return { text: s, truncated: false }
}

export function addCallLog(entry: CallLogInput): void {
  const reqBody = stringifyBody(entry.requestBody)
  const resBody = stringifyBody(entry.responseBody)
  const rec: CallLogEntry = {
    id: String(logIdCounter++),
    timestamp: Date.now(),
    kind: entry.kind,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    durationMs: entry.durationMs,
    model: entry.model,
    tokens: entry.tokens,
    ip: entry.ip,
    error: entry.error,
    stream: entry.stream,
    requestHeaders: normalizeHeaders(entry.requestHeaders),
    requestBody: reqBody.text,
    responseHeaders: normalizeHeaders(entry.responseHeaders),
    responseBody: resBody.text,
    truncated: reqBody.truncated || resBody.truncated,
  }
  logs.push(rec)
  if (logs.length > MAX_LOGS) logs.shift()
  send('logs:new', rec)
}

export function getCallLogs(): CallLogEntry[] {
  return logs.slice()
}

export function clearCallLogs(): void {
  logs.length = 0
}
