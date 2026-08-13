import { create } from 'zustand'
import { type GatewayConfig, DEFAULT_GATEWAY } from '@/lib/gateway'

interface GatewayState {
  config: GatewayConfig
  running: boolean
  setPort: (port: number) => void
  setBindAddress: (addr: string) => void
  setApiKey: (key: string) => void
  setRunning: (running: boolean) => void
  setConfig: (config: GatewayConfig) => void
  toggleRunning: () => void
}

export const useGatewayStore = create<GatewayState>()((set) => ({
  config: { ...DEFAULT_GATEWAY },
  running: false,
  setPort: (port) =>
    set((s) => ({ config: { ...s.config, port } })),
  setBindAddress: (bindAddress) =>
    set((s) => ({ config: { ...s.config, bindAddress } })),
  setApiKey: (apiKey) =>
    set((s) => ({ config: { ...s.config, apiKey } })),
  setRunning: (running) => set({ running }),
  setConfig: (config) => set({ config }),
  toggleRunning: () =>
    set((s) => ({ running: !s.running })),
}))
