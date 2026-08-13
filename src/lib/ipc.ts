export type UnlistenFn = () => void

export function invoke<T = unknown>(
  cmd: string,
  args?: unknown,
): Promise<T> {
  return window.electronAPI.invoke(cmd, args) as Promise<T>
}

export function listen<T = unknown>(
  event: string,
  callback: (event: { payload: T }) => void,
): UnlistenFn {
  return window.electronAPI.listen(event, (payload) =>
    callback({ payload: payload as T }),
  )
}
