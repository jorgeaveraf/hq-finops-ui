import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { ClientListContext } from '../qbo/pages/ClientListPage'

export function RequireAdmin() {
  const { isAuthenticated, role, kind, access, isLoading } = useAuth()
  const location = useLocation()
  const clientList = useOutletContext<ClientListContext>()

  if (isLoading) return <p className="p-8 text-sm text-slate-600">Checking session...</p>

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const permitted = kind === 'local' ? role === 'admin'
    : kind === 'google' && access?.user.role === 'Admin'
      && access.effective_grants.some((grant) => grant.operation === 'entities.manage' && !grant.client_id && !grant.environment)

  if (!permitted) {
    return <Navigate to="/" replace />
  }

  return <Outlet context={clientList} />
}

