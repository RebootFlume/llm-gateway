import { invoke } from '@/lib/ipc'
import type { Conversation } from '@/lib/store/chat'

export interface ChatIndex {
  conversations: Array<Pick<Conversation, 'id' | 'title' | 'model' | 'createdAt'>>
  activeId: string | null
}

export interface ChatSaveBatch {
  changed: Conversation[]
  removed: string[]
  index: ChatIndex
}

export interface ChatHistory {
  conversations: Conversation[]
  activeId: string | null
}

export function loadChatHistory() {
  return invoke<ChatHistory | null>('chat_load')
}

export function saveChatBatch(batch: ChatSaveBatch) {
  return invoke<void>('chat_save_batch', batch)
}
