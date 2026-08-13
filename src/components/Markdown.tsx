import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langJavascript from '@shikijs/langs/javascript'
import langTypescript from '@shikijs/langs/typescript'
import langJsx from '@shikijs/langs/jsx'
import langTsx from '@shikijs/langs/tsx'
import langBash from '@shikijs/langs/bash'
import langJson from '@shikijs/langs/json'
import langPython from '@shikijs/langs/python'
import langMarkdown from '@shikijs/langs/markdown'
import themeGithubLight from '@shikijs/themes/github-light'
import themeGithubDark from '@shikijs/themes/github-dark'
import { useThemeStore } from '@/lib/store/theme'

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [themeGithubLight, themeGithubDark],
      langs: [
        langJavascript,
        langTypescript,
        langJsx,
        langTsx,
        langBash,
        langJson,
        langPython,
        langMarkdown,
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

export function Markdown({ content }: { content: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const mode = useThemeStore((s) => s.mode)
  const dark =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : mode === 'dark'

  useEffect(() => {
    let active = true
    getHighlighter().then((h) => {
      if (active) setHighlighter(h)
    })
    return () => {
      active = false
    }
  }, [])

  const theme = dark ? 'github-dark' : 'github-light'

  return (
    <div className="prose-custom text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const code = String(children).replace(/\n$/, '')
            if (match && highlighter) {
              try {
                return (
                  <span
                    className="block overflow-x-auto rounded-lg"
                    dangerouslySetInnerHTML={{
                      __html: highlighter.codeToHtml(code, {
                        lang: match[1],
                        theme,
                      }),
                    }}
                  />
                )
              } catch {
                // language grammar not bundled — render as plain code
              }
            }
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
                {...props}
              >
                {children}
              </code>
            )
          },
          a: ({ children, ...props }) => (
            <a
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal pl-5">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-xl font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="my-2 w-full border-collapse text-sm">
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
