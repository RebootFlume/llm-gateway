import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataDir } from './config-store'

/**
 * Chat history persistence: `<data>/chat/` — one JSON file per conversation
 * plus `index.json` (id/title/model/createdAt + activeId). Writing a single
 * conversation rewrites only its own file, not the whole history.
 *
 * Write order is conversation file first, index last (index is the commit
 * point). If the index is ever missing/corrupt (crash between the two), it is
 * rebuilt by scanning the directory on the next load. A legacy single
 * `data/chat.json` is split into this layout on first load.
 */

export interface ChatMeta {
  id: string
  title: string
  model: string
  createdAt: number
}

export interface ChatIndex {
  conversations: ChatMeta[]
  activeId: string | null
}

export interface ChatSaveBatch {
  changed: unknown[]
  removed: string[]
  index: ChatIndex
}

function chatPath(): string {
  return path.join(dataDir(), 'chat')
}

function convPath(id: string): string {
  return path.join(dataDir(), 'chat', `${id}.json`)
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const s = await fs.readFile(file, 'utf-8')
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function atomicWrite(file: string, data: unknown): Promise<void> {
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

/** Pull the metadata a sidebar needs out of a stored conversation. */
function toMeta(conv: Record<string, unknown>): ChatMeta | null {
  const id = conv.id
  if (typeof id !== 'string') return null
  return {
    id,
    title: typeof conv.title === 'string' ? conv.title : '',
    model: typeof conv.model === 'string' ? conv.model : '',
    createdAt: typeof conv.createdAt === 'number' ? conv.createdAt : Date.now(),
  }
}

/** Split a legacy single `<data>/chat.json` into per-conversation files. */
async function migrateLegacy(): Promise<void> {
  const legacy = path.join(dataDir(), 'chat.json')
  const s = await readJson<{ conversations?: unknown[]; activeId?: string | null }>(legacy)
  if (!s || !Array.isArray(s.conversations)) return
  const index: ChatIndex = {
    conversations: [],
    activeId: typeof s.activeId === 'string' ? s.activeId : null,
  }
  await fs.mkdir(chatPath(), { recursive: true })
  for (const raw of s.conversations) {
    if (!raw || typeof raw !== 'object') continue
    const meta = toMeta(raw as Record<string, unknown>)
    if (!meta) continue
    await atomicWrite(convPath(meta.id), raw)
    index.conversations.push(meta)
  }
  await atomicWrite(path.join(chatPath(), 'index.json'), index)
  await fs.rename(legacy, legacy + '.legacy')
}

/** Rebuild the index from the files on disk (crash between file and index writes). */
async function rebuildIndexFromFiles(): Promise<ChatIndex | null> {
  let names: string[]
  try {
    names = await fs.readdir(chatPath())
  } catch {
    return null
  }
  const conversations: ChatMeta[] = []
  for (const name of names) {
    if (!name.endsWith('.json') || name === 'index.json') continue
    const conv = await readJson<Record<string, unknown>>(path.join(chatPath(), name))
    if (!conv) continue
    const meta = toMeta(conv)
    if (meta) conversations.push(meta)
  }
  return { conversations, activeId: null }
}

export async function loadChatHistory(): Promise<{
  conversations: unknown[]
  activeId: string | null
} | null> {
  await migrateLegacy()
  let index = await readJson<ChatIndex>(path.join(chatPath(), 'index.json'))
  if (!index || !Array.isArray(index.conversations)) {
    const rebuilt = await rebuildIndexFromFiles()
    if (!rebuilt) return null
    index = rebuilt
    await fs.mkdir(chatPath(), { recursive: true })
    await atomicWrite(path.join(chatPath(), 'index.json'), rebuilt)
  }
  const conversations: unknown[] = []
  for (const meta of index.conversations) {
    const conv = await readJson<unknown>(convPath(meta.id))
    if (conv !== null) conversations.push(conv)
  }
  return { conversations, activeId: index.activeId ?? null }
}

export async function saveChatBatch(batch: ChatSaveBatch): Promise<void> {
  await fs.mkdir(chatPath(), { recursive: true })
  for (const raw of batch.changed) {
    if (!raw || typeof raw !== 'object') continue
    const meta = toMeta(raw as Record<string, unknown>)
    if (!meta) continue
    await atomicWrite(convPath(meta.id), raw)
  }
  for (const id of batch.removed) {
    await fs.rm(convPath(id), { force: true })
  }
  await atomicWrite(path.join(chatPath(), 'index.json'), batch.index)
}
