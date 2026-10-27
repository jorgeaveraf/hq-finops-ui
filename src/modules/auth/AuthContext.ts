import { createContext } from 'react'

export type Session = {
  user: { name: string; email: string }
  role: 'admin' | 'operator'
  csrf: string
}

export type AuthContextValue = {
  user: Session['user'] | null
  role: Session['role'] | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
