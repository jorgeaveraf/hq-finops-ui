import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './modules/auth/AuthProvider'
import { RequireAuth } from './modules/auth/RequireAuth'
import { RequireAdmin } from './modules/auth/RequireAdmin'
import { LoginPage } from './modules/auth/LoginPage'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { ClientListPage } from './modules/qbo/pages/ClientListPage'
import { ClientDetailPage } from './modules/qbo/pages/ClientDetailPage'
import { CreateClientPage } from './modules/qbo/pages/CreateClientPage'
import { AppLayout } from './layout/AppLayout'

function App() {
  return (
    <BrowserRouter basename="/automations">
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: '14px', fontWeight: 500 },
            success: { iconTheme: { primary: '#1FA196', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/qbo/clients" element={<ClientListPage />} />
              <Route path="/qbo/clients/new" element={<CreateClientPage />} />
              <Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
