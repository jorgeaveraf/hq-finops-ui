import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireActivityRead() {
  const { kind, access, isLoading } = useAuth()
  if (isLoading) return <p className="p-8 text-sm text-slate-600">Checking access...</p>
  const permitted = kind === 'google' && access?.user.role === 'Admin'
    && access.effective_grants.some((grant) => grant.operation === 'activity.read' && !grant.client_id && !grant.environment)
  return permitted ? <Outlet /> : <Navigate to="/access" replace />
}
