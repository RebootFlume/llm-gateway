import { invoke } from '@/lib/ipc'

export function startGateway(port: number, bindAddress: string, apiKey: string) {
  return invoke<void>('start_gateway', { port, bindAddress, apiKey })
}

export function stopGateway() {
  return invoke<void>('stop_gateway')
}

export function gatewayStatus() {
  return invoke<boolean>('gateway_status')
}
