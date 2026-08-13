import { ActivityBar } from './ActivityBar'
import { SideBar } from './SideBar'
import { StatusBar } from './StatusBar'
import { useState } from 'react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="grid h-full w-full grid-rows-[1fr_auto] overflow-hidden bg-background text-foreground">
      <div
        className="grid overflow-hidden transition-[grid-template-columns] duration-200 ease-out"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? '48px 0px 1fr'
            : '48px 240px 1fr',
        }}
      >
        <ActivityBar
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />
        <SideBar collapsed={sidebarCollapsed} />
        <main className="overflow-hidden">{children}</main>
      </div>
      <StatusBar />
    </div>
  )
}
