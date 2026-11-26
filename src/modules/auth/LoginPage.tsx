import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { useAuth } from './useAuth'
import hqLogo from '../../assets/hq-logo.png'

type LocationState = {
  from?: string
}

export function LoginPage() {
  const { login, startGoogleLogin, authError, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = (location.state as LocationState | undefined)?.from || '/'
  const googleErrorCode = searchParams.get('auth_error')
  const googleError = googleErrorCode === 'not_authorized' || authError
    ? {
        title: "Access isn't enabled for this account",
        message: 'Sign in with an approved Google account. To use this one, ask a FinOps administrator to add your email in People and access.',
      }
    : ({
        invalid_state: { title: 'Your sign-in session expired', message: 'Continue with Google to start a new sign-in.' },
        google_failed: { title: "Google sign-in couldn't be completed", message: 'Please try again.' },
        unavailable: { title: 'Sign-in is temporarily unavailable', message: 'Please try again later.' },
      } as Record<string, { title: string; message: string }>)[googleErrorCode || '']

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username || !password) {
      setError('Username and password are required.')
      return
    }
    setIsSubmitting(true)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      const status = err instanceof Error && 'status' in err ? err.status : null
      setError(status === 401
        ? 'That username or password is incorrect. Please try again.'
        : 'We could not sign you in right now. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-hq-gray flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3 mb-7">
          <img src={hqLogo} alt="HQ" className="h-11 w-11 rounded-full object-contain" />
          <div>
            <p className="text-sm font-semibold text-hq-teal">
              Headquarters
            </p>
            <h1 className="text-xl font-semibold text-slate-900">Sign in to FinOps</h1>
          </div>
        </div>

        <section aria-label="Google sign-in" className="space-y-4">
          {googleError && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div>
                <p className="font-semibold">{googleError.title}</p>
                <p className="mt-1 leading-relaxed">{googleError.message}</p>
              </div>
            </div>
          )}
          <Button type="button" className="w-full min-h-11" onClick={startGoogleLogin}>
            Continue with Google
          </Button>
        </section>

        <div className="relative my-6 border-t border-slate-200" aria-hidden="true">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white px-3 text-xs font-medium text-slate-500">or</span>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} aria-label="Local sign-in">
          <h2 className="text-sm font-semibold text-slate-900">Sign in with a username and password</h2>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <TextField
            label="Username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <TextField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            trailing={
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-hq-teal hover:bg-slate-100 transition"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Button type="submit" variant="secondary" className="w-full min-h-11 border-slate-300 text-hq-teal hover:bg-slate-50" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in with password'}
          </Button>
        </form>
      </div>
    </main>
  )
}
