import { createContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

type AuthContextValue = {
  user: { name: string; email: string } | null
  role: 'admin' | 'operator' | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  expectedUsername: string
}

const AUTH_KEY = 'hq_finops_auth'

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const expectedUsername = String(import.meta.env.VITE_APP_USERNAME || '')
  const expectedPassword = String(import.meta.env.VITE_APP_PASSWORD || '')
  const adminUsername = String(import.meta.env.VITE_ADMIN_USERNAME || '')
  const adminPassword = String(import.meta.env.VITE_ADMIN_PASSWORD || '')
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [role, setRole] = useState<'admin' | 'operator' | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY)
    if (stored === 'admin') {
      setRole('admin')
      setUser({
        name: 'Admin',
        email: adminUsername || 'admin',
      })
      return
    }
    if (stored === 'operator' || stored === '1') {
      setRole('operator')
      setUser({
        name: 'FinOps Operator',
        email: `${expectedUsername}`,
      })
    }
  }, [adminUsername, expectedUsername])

  const login = async (username: string, password: string) => {
    if (adminUsername && adminPassword && username === adminUsername && password === adminPassword) {
      setRole('admin')
      setUser({
        name: 'Admin',
        email: adminUsername,
      })
      localStorage.setItem(AUTH_KEY, 'admin')
      return
    }
    if (expectedUsername && expectedPassword && username === expectedUsername && password === expectedPassword) {
      setRole('operator')
      setUser({
        name: 'FinOps Operator',
        email: `${username}`,
      })
      localStorage.setItem(AUTH_KEY, 'operator')
      return
    }
    throw new Error('Invalid credentials')
  }

  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    setUser(null)
    setRole(null)
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
    window.location.replace(`${base}login`)
  }

  const value = useMemo(
    () => ({
      user,
      role,
      isAuthenticated: Boolean(user),
      login,
      logout,
      expectedUsername,
    }),
    [user, role, expectedUsername],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
