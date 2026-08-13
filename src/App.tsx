import { Routes, Route, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ChatPage } from '@/pages/chat'
import { ModelsPage } from '@/pages/models'
import { GatewayPage } from '@/pages/gateway'
import { CallLogDetailPage } from '@/pages/call-log-detail'
import { SettingsPage } from '@/pages/settings'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/models/:providerId" element={<ModelsPage />} />
        <Route path="/gateway" element={<GatewayPage />} />
        <Route path="/logs" element={<CallLogDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  )
}

export default App
