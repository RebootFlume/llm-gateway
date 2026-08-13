import { useLocation } from 'react-router'
import { Circle } from 'lucide-react'
import { sectionKey, sectionLabelKey } from '@/lib/nav'
import { useI18n } from '@/lib/i18n'

export function StatusBar() {
  const { t } = useI18n()
  const location = useLocation()
  const section = sectionKey(location.pathname)
  const labelKey = sectionLabelKey(section)

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border bg-muted px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Circle className="size-2 fill-emerald-500 text-emerald-500" />
        <span>{labelKey ? t(labelKey) : t('nav.ready')}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>v0.1.0</span>
      </div>
    </footer>
  )
}
