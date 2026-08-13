import { invoke } from '@/lib/ipc'
import type { AdapterType } from '@/lib/providers'

export interface ProviderConfigDTO {
  adapter: AdapterType
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

/** Provider fields the main-process script runtime needs. */
export interface ScriptProviderRef {
  id: string
  scriptContent?: string
  baseUrl: string
  apiKey: string
}

export interface PreparedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export interface ScriptValidation {
  ok: boolean
  error?: string
}

export function testConnection(p: ProviderConfigDTO) {
  return invoke<TestResult>('test_connection', { provider: p })
}

export function pullModels(p: ProviderConfigDTO) {
  return invoke<ModelInfo[]>('pull_models', { provider: p })
}

/** Run the script's listModels() in the main-process sandbox. */
export function listScriptModels(p: ScriptProviderRef) {
  return invoke<ModelInfo[]>('script_list_models', { provider: p })
}

/** Stream a chat through the script: prepare -> upstream -> parse -> events. */
export function scriptChat(p: ScriptProviderRef, openaiReq: unknown, requestId: string) {
  return invoke<void>('script_chat', { provider: p, openaiReq, requestId })
}

/** Compile-check a script at save time; returns an error message when invalid. */
export function validateScript(scriptContent: string) {
  return invoke<ScriptValidation>('script_validate', { scriptContent })
}

/** Run prepareRequest against a sample request (no upstream call) for editing. */
export function previewScriptRequest(p: ScriptProviderRef, openaiReq: unknown) {
  return invoke<PreparedRequest>('script_preview', { provider: p, openaiReq })
}
