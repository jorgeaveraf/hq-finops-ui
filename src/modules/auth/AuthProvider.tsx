import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { apiRequest, setCsrfToken } from '../../api/finopsApi'
import { AuthContext, type Session } from './AuthContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<Session['user'] | null>(null)
  const [role, setRole] = useState<Session['role'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest<Session>('/session')
      .then((session) => {
        if (!active) return
        setUser(session.user)
        setRole(session.role)
        setCsrfToken(session.csrf)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setRole(null)
        setCsrfToken(null)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  const login = async (username: string, password: string) => {
    const session = await apiRequest<Session>('/session', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(session.user)
    setRole(session.role)
    setCsrfToken(session.csrf)
  }

  const logout = async () => {
    await apiRequest('/session', { method: 'DELETE' })
    setCsrfToken(null)
    setUser(null)
    setRole(null)
    window.location.replace(`${import.meta.env.BASE_URL}login`)
  }

  const value = useMemo(
    () => ({ user, role, isAuthenticated: Boolean(user), isLoading, login, logout }),
    [user, role, isLoading],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
