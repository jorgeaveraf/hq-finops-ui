import { createContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

type AuthContextValue = {
  user: { name: string; email: string } | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  expectedUsername: string
}

const AUTH_KEY = 'hq_finops_auth'
const FALLBACK_USERNAME = 'admin'
const FALLBACK_PASSWORD = 'admin'

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const expectedUsername = import.meta.env.VITE_APP_USERNAME || FALLBACK_USERNAME
  const expectedPassword = import.meta.env.VITE_APP_PASSWORD || FALLBACK_PASSWORD
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY)
    if (stored === '1') {
      setUser({
        name: 'FinOps Operator',
        email: `${expectedUsername}`,
      })
    }
  }, [expectedUsername])

  const login = async (username: string, password: string) => {
    if (username === expectedUsername && password === expectedPassword) {
      setUser({
        name: 'FinOps Operator',
        email: `${username}`,
      })
      localStorage.setItem(AUTH_KEY, '1')
      return
    }
    throw new Error('Invalid credentials')
  }

  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    setUser(null)
    window.location.replace('/login')
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
      expectedUsername,
    }),
    [user, expectedUsername],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
