import { create } from 'zustand'
import type { CallLogEntry } from '@/lib/call-log-api'

interface CallLogState {
  logs: CallLogEntry[]
  selectedId: string | null
  setLogs: (logs: CallLogEntry[]) => void
  appendLog: (entry: CallLogEntry) => void
  select: (id: string | null) => void
  clear: () => void
}

export const useCallLogStore = create<CallLogState>()((set) => ({
  logs: [],
  selectedId: null,
  setLogs: (logs) => set({ logs }),
  appendLog: (entry) => set((s) => ({ logs: [...s.logs, entry] })),
  select: (selectedId) => set({ selectedId }),
  clear: () => set({ logs: [], selectedId: null }),
}))
