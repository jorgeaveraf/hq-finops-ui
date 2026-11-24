import { createContext } from 'react'

export type Session = {
  user: { name: string; email: string }
  role: 'admin' | 'operator'
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
  role: Session['role'] | null
  kind: 'google' | 'local' | null
  access: MyAccess | null
  authError: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  startGoogleLogin: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
