import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireClientRead() {
  const { kind, role, access, isLoading } = useAuth()
  if (isLoading) return <p className="p-8 text-sm text-slate-600">Checking access...</p>
  const permitted = kind === 'local' ? role === 'admin'
    : kind === 'google' && access?.effective_grants.some((grant) => grant.operation === 'client.read')
  return permitted ? <Outlet /> : <Navigate to="/" replace />
}
