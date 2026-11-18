import { useEffect, useState, type PropsWithChildren } from 'react'
import { apiRequest, setCsrfToken } from '../../api/finopsApi'
import { AuthContext, type MyAccess, type Session } from './AuthContext'

type GoogleSession = Pick<Session, 'user' | 'csrf'> & {
  user: Session['user'] & { issuer: string; sub: string }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<Session['user'] | null>(null)
  const [role, setRole] = useState<Session['role'] | null>(null)
  const [kind, setKind] = useState<'google' | 'local' | null>(null)
  const [access, setAccess] = useState<MyAccess | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const restore = async () => {
      let googleSession: GoogleSession | null = null
      try {
        const session = await apiRequest<GoogleSession>('/access/session')
        if (session.user?.issuer && session.user?.sub) googleSession = session
      } catch {
        // Local sessions remain available during migration.
      }
      if (googleSession) {
        try {
          const myAccess = await apiRequest<MyAccess>('/access/me')
          if (!myAccess.user || !Array.isArray(myAccess.effective_grants) || myAccess.user.status !== 'active') {
            throw new Error('Google user is not enabled')
          }
          if (!active) return
          setUser(googleSession.user)
          setKind('google')
          setAccess(myAccess)
          setCsrfToken(googleSession.csrf)
        } catch {
          if (!active) return
          setAuthError('Your Google account does not have FinOps access. Contact an administrator.')
          setCsrfToken(null)
        }
        return
      }
      try {
        const session = await apiRequest<Session>('/session')
        if (!active) return
        setUser(session.user)
        setRole(session.role)
        setKind('local')
        setCsrfToken(session.csrf)
      } catch {
        if (!active) return
        setUser(null)
        setRole(null)
        setKind(null)
        setCsrfToken(null)
      }
    }
    void restore().finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const login = async (username: string, password: string) => {
    const session = await apiRequest<Session>('/session', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(session.user)
    setRole(session.role)
    setKind('local')
    setAccess(null)
    setAuthError(null)
    setCsrfToken(session.csrf)
  }

  const startGoogleLogin = () => {
    window.location.assign('/automations/api/auth/google/start')
  }

  const logout = async () => {
    await apiRequest(kind === 'google' ? '/access/session' : '/session', { method: 'DELETE' })
    setCsrfToken(null)
    setUser(null)
    setRole(null)
    setKind(null)
    setAccess(null)
    window.location.replace(`${import.meta.env.BASE_URL}login`)
  }

  const value = { user, role, kind, access, authError, isAuthenticated: Boolean(user), isLoading, login, logout, startGoogleLogin }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
