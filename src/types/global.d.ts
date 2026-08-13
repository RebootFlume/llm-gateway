export {}

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, args?: unknown) => Promise<unknown>
      listen: (
        channel: string,
        callback: (payload: unknown) => void,
      ) => () => void
    }
  }
}
