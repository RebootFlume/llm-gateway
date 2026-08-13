import { invoke, listen, type UnlistenFn } from '@/lib/ipc'

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

export function getCallLogs() {
  return invoke<CallLogEntry[]>('logs_list')
}

export function clearCallLogs() {
  return invoke<void>('logs_clear')
}

export function onCallLog(cb: (entry: CallLogEntry) => void): UnlistenFn {
  return listen<CallLogEntry>('logs:new', (event) => cb(event.payload))
}
