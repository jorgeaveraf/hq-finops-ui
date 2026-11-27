import { createContext } from 'react'

export type Session = {
  user: { name: string; email: string }
  csrf: string
}

export type AccessGrant = {
  id: string
  operation: string
  client_id: string | null
  environment: string | null
}

export type MyAccess = {
  user: { id: string; role: 'Admin' | 'Operator' | 'Viewer'; status: string; is_super_admin?: boolean; is_super_admin_founder?: boolean }
  effective_grants: AccessGrant[]
}

export type AuthContextValue = {
  user: Session['user'] | null
  kind: 'google' | null
  access: MyAccess | null
  authError: string | null
  isAuthenticated: boolean
  isLoading: boolean
  logout: () => Promise<void>
  startGoogleLogin: () => void
  refreshAccess: () => Promise<MyAccess>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
