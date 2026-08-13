import { PageHeader } from '@/components/layout/PageHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useLocaleStore } from '@/lib/store/locale'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import {
  ACCENT_PRESETS,
  useThemeStore,
  type ThemeMode,
} from '@/lib/store/theme'

const MODES: { value: ThemeMode; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

const LOCALES: { value: 'zh' | 'en'; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="py-5">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useI18n()
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)
  const customAccent = useThemeStore((s) => s.customAccent)
  const setCustomAccent = useThemeStore((s) => s.setCustomAccent)
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl divide-y divide-border px-6">
          <Section
            title={t('settings.language')}
            desc={t('settings.languageDesc')}
          >
            <div className="flex gap-2">
              {LOCALES.map((l) => {
                const active = locale === l.value
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLocale(l.value)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l.label}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section
            title={t('settings.theme')}
            desc={t('settings.themeDesc')}
          >
            <div className="flex gap-2">
              {MODES.map((m) => {
                const active = mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <m.icon className="size-4" />
                    {t(`settings.${m.value}` as const)}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section
            title={t('settings.accent')}
            desc={t('settings.accentDesc')}
          >
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => {
                const active = accent === p.name
                return (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    onClick={() => setAccent(p.name)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105',
                      active ? 'border-foreground' : 'border-transparent',
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${p.light} 50%, ${p.dark} 50%)`,
                    }}
                  >
                    {active && (
                      <Check className="size-4 text-white drop-shadow" />
                    )}
                  </button>
                )
              })}
            </div>
            <Separator className="my-4" />
            <div className="flex items-center gap-3">
              <label
                htmlFor="custom-accent"
                className="text-sm text-muted-foreground"
              >
                {t('settings.custom')}
              </label>
              <input
                id="custom-accent"
                type="color"
                value={customAccent ?? '#aa3bff'}
                onChange={(e) => setCustomAccent(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
              <span className="font-mono text-xs text-muted-foreground">
                {customAccent ?? '—'}
              </span>
            </div>
          </Section>

          <Section title={t('settings.about')}>
            <div className="text-sm text-muted-foreground">
              <p>llm-gateway · v0.1.0</p>
              <p className="mt-1">Tauri + Vite + React + Tailwind + shadcn/ui</p>
            </div>
          </Section>
        </div>
      </ScrollArea>
    </div>
  )
}
