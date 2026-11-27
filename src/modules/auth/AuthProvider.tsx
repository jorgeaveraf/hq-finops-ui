import { useEffect, useState, type PropsWithChildren } from 'react'
import { apiRequest, setCsrfToken } from '../../api/finopsApi'
import { AuthContext, type MyAccess, type Session } from './AuthContext'

type GoogleSession = Pick<Session, 'user' | 'csrf'> & {
  user: Session['user'] & { issuer: string; sub: string }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<Session['user'] | null>(null)
  const [kind, setKind] = useState<'google' | null>(null)
  const [access, setAccess] = useState<MyAccess | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const restore = async () => {
      let googleSession: GoogleSession
      try {
        const session = await apiRequest<GoogleSession>('/access/session')
        if (!session.user?.issuer || !session.user?.sub) throw new Error('Invalid Google session')
        googleSession = session
      } catch {
        if (!active) return
        setUser(null)
        setKind(null)
        setAccess(null)
        setCsrfToken(null)
        return
      }
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
        setAuthError("This account isn't enabled.")
        setCsrfToken(null)
      }
    }
    void restore().finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const startGoogleLogin = () => {
    window.location.assign('/automations/api/auth/google/start')
  }

  const refreshAccess = async () => {
    const myAccess = await apiRequest<MyAccess>('/access/me')
    setAccess(myAccess)
    return myAccess
  }

  const logout = async () => {
    await apiRequest('/access/session', { method: 'DELETE' })
    setCsrfToken(null)
    setUser(null)
    setKind(null)
    setAccess(null)
    window.location.replace(`${import.meta.env.BASE_URL}login`)
  }

  const value = { user, kind, access, authError, isAuthenticated: Boolean(user), isLoading, logout, startGoogleLogin, refreshAccess }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
