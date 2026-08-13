import { loadConfig, saveConfig, type AppConfig } from '@/lib/config-api'
import { loadChatHistory, saveChatBatch } from '@/lib/chat-api'
import { useProvidersStore } from './providers'
import { useGatewayStore } from './gateway'
import { useThemeStore } from './theme'
import { useLocaleStore } from './locale'
import { useChatStore, type Conversation } from './chat'
import { applyTheme } from '@/lib/theme-apply'
import { DEFAULT_GATEWAY } from '@/lib/gateway'

export async function initAppConfig() {
  try {
    const cfg = await loadConfig()
    if (cfg?.locale) {
      useLocaleStore.setState({ locale: cfg.locale })
    }
    if (cfg?.theme) {
      useThemeStore.setState({
        mode: cfg.theme.mode ?? 'system',
        accent: cfg.theme.accent ?? 'Vite Purple',
        customAccent: cfg.theme.customAccent ?? null,
      })
    }
    if (cfg?.providers && Array.isArray(cfg.providers)) {
      useProvidersStore.setState({ providers: cfg.providers })
    }
    if (cfg?.gateway) {
      useGatewayStore.setState({ config: cfg.gateway })
    } else {
      useGatewayStore.setState({ config: { ...DEFAULT_GATEWAY } })
    }
    const chat = await loadChatHistory()
    if (chat && Array.isArray(chat.conversations)) {
      const convs = chat.conversations as Conversation[]
      const activeId =
        typeof chat.activeId === 'string' &&
        convs.some((c) => c.id === chat.activeId)
          ? chat.activeId
          : null
      useChatStore.setState({ conversations: convs, activeId })
      seedChatSnapshot(convs, activeId)
    }
  } catch (e) {
    console.error('load config failed:', e)
  }
  applyTheme()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { providers } = useProvidersStore.getState()
    const { config: gateway } = useGatewayStore.getState()
    const { mode, accent, customAccent } = useThemeStore.getState()
    const { locale } = useLocaleStore.getState()
    const cfg: AppConfig = {
      providers,
      gateway,
      theme: { mode, accent, customAccent },
      locale,
    }
    saveConfig(cfg).catch((e) => console.error('save config failed:', e))
  }, 300)
}

// Chat history: debounced to coalesce rapid edits, plus a max-wait so an
// ongoing stream still lands on disk periodically. flushChatHistory() forces
// an immediate write when a stream finishes.
//
// Persisted per conversation: each flush writes only the conversation file(s)
// that actually changed — found by reference-identity diff against the last
// saved snapshot (zustand updates are immutable, so a changed conversation is a
// new object) — plus `index.json`, regenerated only when id/title/model/createdAt
// order or activeId moved.
const CHAT_DEBOUNCE_MS = 1000
const CHAT_MAX_WAIT_MS = 2000
let chatSaveTimer: ReturnType<typeof setTimeout> | undefined
let chatMaxTimer: ReturnType<typeof setTimeout> | undefined
let chatDirty = false

interface ChatSnapshot {
  byId: Map<string, Conversation>
  meta: string
  activeId: string | null
}

const lastSaved: ChatSnapshot = { byId: new Map(), meta: '', activeId: null }

/** Serialized id/title/model/createdAt list — cheap fingerprint of the index. */
function chatMetaKey(conversations: Conversation[]): string {
  return conversations
    .map((c) => `${c.id}\u0000${c.title}\u0000${c.model}\u0000${c.createdAt}`)
    .join('\u0001')
}

/** Record what was just loaded so the first user change is truly incremental. */
function seedChatSnapshot(conversations: Conversation[], activeId: string | null) {
  lastSaved.byId = new Map(conversations.map((c) => [c.id, c]))
  lastSaved.meta = chatMetaKey(conversations)
  lastSaved.activeId = activeId
}

function saveChatNow() {
  clearTimeout(chatSaveTimer)
  clearTimeout(chatMaxTimer)
  chatSaveTimer = undefined
  chatMaxTimer = undefined
  if (!chatDirty) return
  chatDirty = false
  const { conversations, activeId } = useChatStore.getState()
  const byId = new Map(conversations.map((c) => [c.id, c]))
  const changed: Conversation[] = []
  const removed: string[] = []
  for (const c of conversations) {
    if (lastSaved.byId.get(c.id) !== c) changed.push(c)
  }
  for (const id of lastSaved.byId.keys()) {
    if (!byId.has(id)) removed.push(id)
  }
  const meta = chatMetaKey(conversations)
  const indexChanged = meta !== lastSaved.meta || activeId !== lastSaved.activeId
  if (!indexChanged && changed.length === 0 && removed.length === 0) return
  const index = {
    conversations: conversations.map(({ id, title, model, createdAt }) => ({
      id,
      title,
      model,
      createdAt,
    })),
    activeId,
  }
  saveChatBatch({ changed, removed, index })
    .then(() => {
      lastSaved.byId = byId
      lastSaved.meta = meta
      lastSaved.activeId = activeId
    })
    .catch((e) => console.error('save chat failed:', e))
}

function scheduleChatSave() {
  chatDirty = true
  if (!chatSaveTimer) {
    chatSaveTimer = setTimeout(saveChatNow, CHAT_DEBOUNCE_MS)
  }
  if (!chatMaxTimer) {
    chatMaxTimer = setTimeout(saveChatNow, CHAT_MAX_WAIT_MS)
  }
}

/** Flush any pending chat-history write immediately (stream end / error). */
export function flushChatHistory(): void {
  saveChatNow()
}

export function setupPersistence() {
  useProvidersStore.subscribe(scheduleSave)
  useGatewayStore.subscribe(scheduleSave)
  useThemeStore.subscribe(scheduleSave)
  useLocaleStore.subscribe(scheduleSave)
  useChatStore.subscribe(scheduleChatSave)
}
