import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { setMainWindow, send } from './emitter'
import { loadConfig, saveConfig } from './config-store'
import { loadChatHistory, saveChatBatch, type ChatSaveBatch } from './chat-store'
import { fetchModels, runTestConnection } from './provider-api'
import {
  startGateway,
  stopGateway,
  gatewayStatus,
  chatCompletion,
  setProviders,
} from './gateway'
import { addCallLog, getCallLogs, clearCallLogs } from './call-log'
import {
  getRuntime,
  streamUpstream,
  validateScript,
  type ScriptRuntime,
} from './script-runtime'

declare global {
  // eslint-disable-next-line no-var
  var MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
  // eslint-disable-next-line no-var
  var MAIN_WINDOW_VITE_NAME: string | undefined
}

interface ScriptProviderRef {
  id: string
  scriptContent?: string
  baseUrl?: string
  apiKey?: string
}

function runtimeFor(provider: ScriptProviderRef): ScriptRuntime {
  return getRuntime(provider.id, {
    scriptContent: provider.scriptContent ?? '',
    baseUrl: provider.baseUrl ?? '',
    apiKey: provider.apiKey ?? '',
  })
}

// User adapter scripts may leave async work unawaited; log instead of letting
// the main process terminate on an unhandled rejection.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

async function runScriptChat(
  provider: ScriptProviderRef,
  openaiReq: unknown,
  requestId: string,
): Promise<void> {
  const start = Date.now()
  let model = ''
  if (openaiReq && typeof openaiReq === 'object' && 'model' in openaiReq) {
    const raw = (openaiReq as Record<string, unknown>).model
    if (typeof raw === 'string') model = raw
  }
  try {
    const runtime = runtimeFor(provider)
    const prepared = await runtime.prepareRequest(openaiReq)
    const completionId = `chatcmpl-${Date.now()}`
    const created = Math.floor(Date.now() / 1000)
    await streamUpstream(runtime, prepared, model, completionId, created, (result) => {
      const delta = result.delta ?? {}
      const content = String(delta.content ?? '')
      const reasoning = String(delta.reasoning_content ?? '')
      if (content || reasoning) {
        send('stream:delta', { requestId, content, reasoning })
      }
    })
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
      requestBody: openaiReq,
      responseHeaders: null,
      responseBody: null,
    })
    send('stream:done', { requestId })
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
      requestBody: openaiReq,
      responseHeaders: null,
      responseBody: null,
    })
    send('stream:error', { requestId, error: (e as Error).message })
  }
}

function syncProviders(config: unknown): void {
  const providers = (config as { providers?: unknown })?.providers
  if (Array.isArray(providers)) {
    setProviders(providers as Parameters<typeof setProviders>[0])
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'llm-gateway',
    icon: path.join(__dirname, '../../build/icon/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setMainWindow(win)
  win.on('closed', () => setMainWindow(null))

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(
      path.join(__dirname, '../renderer/main_window/index.html'),
    )
  }
}

function registerIpc(): void {
  ipcMain.handle('load_config', async () => {
    const cfg = await loadConfig()
    syncProviders(cfg)
    return cfg
  })

  ipcMain.handle('save_config', async (_e, args: { config: unknown }) => {
    await saveConfig(args.config)
    syncProviders(args.config)
  })

  ipcMain.handle('chat_load', () => loadChatHistory())
  ipcMain.handle('chat_save_batch', (_e, args: ChatSaveBatch) =>
    saveChatBatch(args),
  )

  ipcMain.handle(
    'start_gateway',
    async (_e, args: { port: number; bindAddress: string; apiKey: string }) => {
      await startGateway(args.port, args.bindAddress, args.apiKey)
    },
  )
  ipcMain.handle('stop_gateway', () => stopGateway())
  ipcMain.handle('gateway_status', () => gatewayStatus())
  ipcMain.handle('logs_list', () => getCallLogs())
  ipcMain.handle('logs_clear', () => clearCallLogs())

  ipcMain.handle(
    'chat_completion',
    (_e, args: { model: string; messages: unknown[] }) =>
      chatCompletion(args.model, args.messages),
  )

  ipcMain.handle(
    'script_list_models',
    (_e, args: { provider: ScriptProviderRef }) =>
      runtimeFor(args.provider).listModels(),
  )
  ipcMain.handle(
    'script_validate',
    (_e, args: { scriptContent: string }) =>
      validateScript(args.scriptContent),
  )
  ipcMain.handle(
    'script_preview',
    (_e, args: { provider: ScriptProviderRef; openaiReq: unknown }) =>
      runtimeFor(args.provider).prepareRequest(args.openaiReq),
  )
  ipcMain.handle(
    'script_chat',
    (
      _e,
      args: { provider: ScriptProviderRef; openaiReq: unknown; requestId: string },
    ) => {
      void runScriptChat(args.provider, args.openaiReq, args.requestId)
      return null
    },
  )

  ipcMain.handle(
    'test_connection',
    (_e, args: { provider: Parameters<typeof runTestConnection>[0] }) =>
      runTestConnection(args.provider),
  )
  ipcMain.handle(
    'pull_models',
    (_e, args: { provider: Parameters<typeof fetchModels>[0] }) =>
      fetchModels(args.provider),
  )
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void stopGateway()
})
