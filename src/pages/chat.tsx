import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/lib/store/chat'
import { useProvidersStore } from '@/lib/store/providers'
import type { Provider } from '@/lib/providers'
import { Markdown } from '@/components/Markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { SendHorizontal, Plus, Brain, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { listen, type UnlistenFn } from '@/lib/ipc'
import { scriptChat } from '@/lib/provider-api'
import { flushChatHistory } from '@/lib/store/persist'

interface ContentPart {
  type: 'think' | 'text'
  content: string
}

function parseThinkTags(content: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = / <think>([\s\S]*?)<\/think>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Only keep non-empty text so adjacent think parts stay adjacent (merging
  // below relies on it — streaming reasoning arrives as many wrapped deltas).
  const pushText = (raw: string) => {
    const text = raw.trim()
    if (text) parts.push({ type: 'text', content: text })
  }

  while ((match = regex.exec(content)) !== null) {
    pushText(content.slice(lastIndex, match.index))
    parts.push({ type: 'think', content: match[1].trim() })
    lastIndex = regex.lastIndex
  }

  // Reasoning still streaming in: an unclosed trailing tag is treated as a
  // think part so raw ` response` tags never leak into visible text.
  const remaining = content.slice(lastIndex)
  const openIdx = remaining.indexOf(' <think>')
  if (openIdx !== -1) {
    pushText(remaining.slice(0, openIdx))
    parts.push({ type: 'think', content: remaining.slice(openIdx + 7).trim() })
  } else {
    pushText(remaining)
  }

  if (parts.length === 0) return [{ type: 'text', content }]

  // Merge consecutive think parts (from streaming reasoning deltas)
  const merged: ContentPart[] = []
  for (const part of parts) {
    if (part.type === 'think' && merged.length > 0 && merged[merged.length - 1].type === 'think') {
      merged[merged.length - 1].content += '\n' + part.content
    } else {
      merged.push(part)
    }
  }
  return merged
}

export function ChatPage() {
  const { t } = useI18n()
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const createConversation = useChatStore((s) => s.createConversation)
  const setActive = useChatStore((s) => s.setActive)
  const addMessage = useChatStore((s) => s.addMessage)
  const appendAssistantContent = useChatStore((s) => s.appendAssistantContent)

  const providers = useProvidersStore((s) => s.providers)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Collect all enabled models from enabled providers
  const allModels = providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.models
        .filter((m) => m.enabled)
        .map((m) => ({
          id: `${p.id}/${m.alias}`,
          alias: m.alias,
          provider: p.name,
        })),
    )

  const active = conversations.find((c) => c.id === activeId)

  // Auto-select first model if none selected
  useEffect(() => {
    if (!selectedModel && allModels.length > 0) {
      setSelectedModel(allModels[0].id)
    }
  }, [allModels, selectedModel])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages])

  function handleNew() {
    if (!selectedModel) return
    const id = createConversation(selectedModel)
    setActive(id)
  }

  async function handleSend() {
    const msg = input.trim()
    if (!msg || !activeId || !selectedModel) return

    setInput('')
    addMessage(activeId!, { role: 'user', content: msg })
    setSending(true)

    const messages = [
      ...useChatStore.getState().conversations.find((c) => c.id === activeId)?.messages ?? [],
    ].map((m) => ({ role: m.role, content: m.content }))

    // Check if this is a script adapter
    const [providerId] = selectedModel.split('/')
    const provider = providers.find((p) => p.id === providerId)
    const isScript = provider?.adapter === 'script'

    if (isScript && provider) {
      await handleScriptSend(provider, messages)
    } else {
      await handleOpenaiSend(messages)
    }
  }

  async function handleOpenaiSend(messages: { role: string; content: string }[]) {
    let buffer = ''
    let unlistenToken: UnlistenFn | undefined
    let unlistenDone: UnlistenFn | undefined
    let unlistenError: UnlistenFn | undefined

    const cleanup = () => {
      unlistenToken?.()
      unlistenDone?.()
      unlistenError?.()
      setSending(false)
      flushChatHistory()
    }

    unlistenToken = await listen<{ text: string }>('chat:token', (event) => {
      buffer += event.payload.text
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue
        try {
          const json = JSON.parse(trimmed.slice(6))
          const delta = json.choices?.[0]?.delta
          const content = delta?.content ?? ''
          const reasoning = delta?.reasoning_content ?? ''
          if (content || reasoning) {
            appendAssistantContent(activeId!, reasoning ? `<think>${reasoning}</think>` : content)
          }
        } catch { /* skip */ }
      }
    })

    unlistenDone = await listen('chat:done', () => cleanup())
    unlistenError = await listen<{ error: string }>('chat:error', (event) => {
      addMessage(activeId!, { role: 'assistant', content: t('chat.errorPrefix', { message: event.payload.error }) })
      cleanup()
    })

    invoke('chat_completion', {
      model: selectedModel,
      messages,
    }).catch((e: unknown) => {
      addMessage(activeId!, { role: 'assistant', content: t('chat.errorPrefix', { message: String(e) }) })
      cleanup()
    })
  }

  async function handleScriptSend(provider: Provider, messages: { role: string; content: string }[]) {
    let unlistenDelta: UnlistenFn | undefined
    let unlistenDone: UnlistenFn | undefined
    let unlistenError: UnlistenFn | undefined

    const cleanup = () => {
      unlistenDelta?.()
      unlistenDone?.()
      unlistenError?.()
      setSending(false)
      flushChatHistory()
    }

    const requestId = 'chat-' + Date.now()

    // Send the mapped upstream model id (m.model), not the display alias —
    // the upstream rejects bare aliases (it prepends an `anthropic:` prefix).
    const alias = selectedModel.split('/').slice(1).join('/')
    const modelEntry = (provider.models ?? []).find((m) => m.alias === alias)
    const upstreamModel = modelEntry?.model || alias

    unlistenDelta = await listen<{ requestId: string; content: string; reasoning: string }>('stream:delta', (event) => {
      if (event.payload.requestId !== requestId) return
      const { content, reasoning } = event.payload
      if (content || reasoning) {
        appendAssistantContent(activeId!, reasoning ? ` <think>${reasoning} </think>` : content)
      }
    })

    unlistenDone = await listen<{ requestId: string }>('stream:done', (event) => {
      if (event.payload.requestId !== requestId) return
      cleanup()
    })

    unlistenError = await listen<{ requestId: string; error: string }>('stream:error', (event) => {
      if (event.payload.requestId !== requestId) return
      addMessage(activeId!, { role: 'assistant', content: t('chat.errorPrefix', { message: event.payload.error }) })
      cleanup()
    })

    scriptChat(
      {
        id: provider.id,
        scriptContent: provider.scriptContent,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || '',
      },
      { model: upstreamModel, messages },
      requestId,
    ).catch((e: unknown) => {
      addMessage(activeId!, { role: 'assistant', content: t('chat.errorPrefix', { message: String(e) }) })
      cleanup()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header: model selector + new button */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Label className="sr-only" htmlFor="model-select">
            {t('chat.model')}
          </Label>
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v ?? '')}>
            <SelectTrigger id="model-select" className="w-56 font-mono text-xs">
              <SelectValue placeholder={t('chat.selectModel')} />
            </SelectTrigger>
            <SelectContent>
              {allModels.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                  {m.id}
                </SelectItem>
              ))}
              {allModels.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {t('chat.noModels')}
                </p>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNew} disabled={!selectedModel}>
            <Plus className="size-4" /> {t('chat.new')}
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="w-full px-6 py-6">
          {!active || active.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <p className="text-sm text-muted-foreground">
                {active ? t('chat.startMessage') : t('chat.createFirst')}
              </p>
              {!active && (
                <Button variant="outline" size="sm" onClick={handleNew} disabled={!selectedModel}>
                  <Plus className="size-4" /> {t('chat.newConversation')}
                </Button>
              )}
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {active.messages.map((msg, i) => {
                const parts = msg.role === 'assistant' ? parseThinkTags(msg.content) : []
                const isStreaming =
                  sending && msg.role === 'assistant' && i === active.messages.length - 1
                const reasoningNow =
                  isStreaming && parts.length > 0 && parts[parts.length - 1].type === 'think'
                return (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-primary/10'
                        : 'bg-card border border-border',
                    )}
                  >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      {msg.role === 'user' ? t('chat.you') : t('chat.assistant')}
                    </p>
                    {msg.role === 'assistant' ? (
                      <div className="flex flex-col gap-2">
                        {parts.map((part, pi) =>
                          part.type === 'think' ? (
                            <details
                              key={pi}
                              open={isStreaming && part.type === 'think'}
                              className="group rounded-md border border-border/50 bg-muted/30"
                            >
                              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground select-none">
                                {reasoningNow && part.type === 'think' ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Brain className="size-3.5" />
                                )}
                                <span>{t('chat.thinking')}</span>
                                <span className="ml-auto text-muted-foreground/50 group-open:hidden">{t('chat.expand')}</span>
                                <span className="ml-auto hidden text-muted-foreground/50 group-open:inline">{t('chat.collapse')}</span>
                              </summary>
                              <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
                                <Markdown content={part.content} />
                              </div>
                            </details>
                          ) : (
                            <Markdown key={pi} content={part.content} />
                          ),
                        )}
                      </div>
                    ) : (
                      <Markdown content={msg.content} />
                    )}
                  </div>
                )
              })}
              {sending && active.messages[active.messages.length - 1]?.role === 'user' && (
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    {t('chat.assistant')}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t('chat.thinking')}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Fixed input area */}
      <div className="shrink-0 border-t border-border bg-background p-3">
        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <div className="flex-1 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/50">
            <textarea
              className="max-h-32 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t('chat.sendPlaceholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
          </div>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !input.trim() || !activeId || !selectedModel}
            aria-label={t('chat.send')}
          >
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}