import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './modules/auth/AuthProvider'
import { RequireAuth } from './modules/auth/RequireAuth'
import { RequireAdmin } from './modules/auth/RequireAdmin'
import { RequireClientRead } from './modules/auth/RequireClientRead'
import { AccessHomePage } from './modules/auth/AccessHomePage'
import { MyApiKeysPage } from './modules/auth/MyApiKeysPage'
import { RequireActivityRead } from './modules/auth/RequireActivityRead'
import { ActivityPage } from './modules/activity/ActivityPage'
import { AccessAdministrationPage } from './modules/auth/AccessAdministrationPage'
import { AccessUserDetailPage } from './modules/auth/AccessUserDetailPage'
import { RequireUsersAdmin } from './modules/auth/RequireUsersAdmin'
import { useAuth } from './modules/auth/useAuth'
import { LoginPage } from './modules/auth/LoginPage'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { ClientListPage } from './modules/qbo/pages/ClientListPage'
import { ClientDetailPage } from './modules/qbo/pages/ClientDetailPage'
import { CreateClientPage } from './modules/qbo/pages/CreateClientPage'
import { AppLayout } from './layout/AppLayout'

export function ClientsRoute() {
  const { access } = useAuth()
  const canManageEntities = access?.user.role === 'Admin' && access.effective_grants.some((grant) => grant.operation === 'entities.manage' && !grant.client_id && !grant.environment)
  return <ClientListPage readOnly={!canManageEntities} />
}

export function ClientDetailRoute() {
  const { access } = useAuth()
  const grants = access?.effective_grants || []
  const { clientId } = useParams<{ clientId: string }>()
  const permitted = (operation: string) => grants.some((grant) => grant.operation === operation
    && !grant.environment && (!grant.client_id || grant.client_id === clientId))
  const canConnect = access?.user.role !== 'Viewer' && (permitted('client.read') || permitted('qbo.entity.read'))
  return <ClientDetailPage
    canUpdate={access?.user.role === 'Admin' && permitted('entities.manage') && (permitted('client.read') || permitted('qbo.entity.read'))}
    canDelete={access?.user.role === 'Admin' && permitted('entities.manage') && (permitted('client.read') || permitted('qbo.entity.read'))}
    canManageConnection={canConnect}
  />
}

function App() {
  return (
    <BrowserRouter basename="/automations">
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: '14px', fontWeight: 500, background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' },
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
            <Route path="/access" element={<AccessHomePage />} />
            <Route path="/access/keys" element={<MyApiKeysPage />} />
            <Route element={<RequireUsersAdmin />}>
              <Route path="/access/users" element={<AccessAdministrationPage />} />
              <Route path="/access/users/:userId" element={<AccessUserDetailPage />} />
            </Route>
            <Route element={<RequireActivityRead />}><Route path="/access/activity" element={<ActivityPage />} /></Route>
            <Route element={<RequireClientRead />}>
              <Route path="/qbo/clients" element={<ClientsRoute />}>
                <Route element={<RequireAdmin />}>
                  <Route path="new" element={<CreateClientPage />} />
                </Route>
              </Route>
              <Route path="/qbo/clients/:clientId" element={<ClientDetailRoute />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
