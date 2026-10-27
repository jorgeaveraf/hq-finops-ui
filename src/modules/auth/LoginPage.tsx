import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Alert } from '../../components/Alert'
import { useAuth } from './useAuth'
import hqLogo from '../../assets/hq-logo.png'

type LocationState = {
  from?: string
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | undefined)?.from || '/'

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
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-hq-gray flex items-center justify-center px-4">
      <div className="max-w-md w-full glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <img src={hqLogo} alt="HQ" className="h-11 w-11 rounded-full object-contain" />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#178a8a' }}>
              Headquarters
            </p>
            <h1 className="text-xl font-semibold text-slate-900">Sign in to FinOps</h1>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 mb-4 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-hq-teal mt-0.5" />
          <div>
            <p className="font-semibold text-slate-900">Hint login</p>
            <p>Use the configured credentials to access the console.</p>
          </div>
        </div>

        {error && <Alert title="Authentication failed" description={error} variant="error" />}

        <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
          <TextField
            label="Username"
            name="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <TextField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter password"
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
