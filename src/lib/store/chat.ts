import { create } from 'zustand'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  createdAt: number
}

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  createConversation: (model: string) => string
  deleteConversation: (id: string) => void
  setActive: (id: string) => void
  addMessage: (conversationId: string, message: ChatMessage) => void
  appendAssistantContent: (conversationId: string, chunk: string) => void
  setConversations: (convs: Conversation[]) => void
}

function genId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** First non-empty line of the first user message, truncated to 30 chars. */
function deriveTitle(content: string): string {
  const line = (content.split('\n').map((s) => s.trim()).find(Boolean) ?? '').replace(/\s+/g, ' ')
  return line.length > 30 ? line.slice(0, 30).trimEnd() + '…' : line
}

export const useChatStore = create<ChatState>()((set) => ({
  conversations: [],
  activeId: null,

  createConversation: (model) => {
    const id = genId()
    const conv: Conversation = {
      id,
      title: '',
      messages: [],
      model,
      createdAt: Date.now(),
    }
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: id }))
    return id
  },

  deleteConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),

  setActive: (id) => set({ activeId: id }),

  addMessage: (conversationId, message) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const title =
          c.title || (message.role === 'user' ? deriveTitle(message.content) : '')
        return { ...c, title, messages: [...c.messages, message] }
      }),
    })),

  appendAssistantContent: (conversationId, chunk) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const msgs = [...c.messages]
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
        } else {
          msgs.push({ role: 'assistant', content: chunk })
        }
        return { ...c, messages: msgs }
      }),
    })),

  setConversations: (convs) => set({ conversations: convs }),
}))