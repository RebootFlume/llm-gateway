import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border px-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
