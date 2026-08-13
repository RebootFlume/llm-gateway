import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'
import { initAppConfig, setupPersistence } from '@/lib/store/persist'
import { useLocaleStore } from '@/lib/store/locale'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient()

async function bootstrap() {
  await initAppConfig()
  setupPersistence()
  // Keep <html lang> in sync with the chosen interface language.
  useLocaleStore.subscribe((s) => {
    document.documentElement.lang = s.locale
  })
  document.documentElement.lang = useLocaleStore.getState().locale
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <TooltipProvider delay={200}>
              <App />
            </TooltipProvider>
          </HashRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}

bootstrap()
