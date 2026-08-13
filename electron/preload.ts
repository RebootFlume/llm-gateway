import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const api = {
  invoke: (channel: string, args?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, args),
  listen: (
    channel: string,
    callback: (payload: unknown) => void,
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) =>
      callback(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
