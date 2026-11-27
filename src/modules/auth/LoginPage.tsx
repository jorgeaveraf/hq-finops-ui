import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { useAuth } from './useAuth'
import hqLogo from '../../assets/hq-logo.png'

export function LoginPage() {
  const { startGoogleLogin, authError, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const googleErrorCode = searchParams.get('auth_error')
  const googleError = googleErrorCode === 'not_authorized' || authError
    ? {
        title: "This account isn't enabled.",
        message: '',
      }
    : ({
        invalid_state: { title: 'Your sign-in session expired', message: 'Continue with Google to start a new sign-in.' },
        google_failed: { title: "Google sign-in couldn't be completed", message: 'Please try again.' },
        unavailable: { title: 'Sign-in is temporarily unavailable', message: 'Please try again later.' },
      } as Record<string, { title: string; message: string }>)[googleErrorCode || '']

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  return (
    <main className="flex min-h-screen items-center justify-center bg-hq-gray px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <img src={hqLogo} alt="Headquarters" className="h-16 w-16 rounded-full object-contain" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-hq-teal">Headquarters</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome to FinOps</h1>
          <p className="mt-3 text-sm text-slate-600">Sign in with your Headquarters Google account.</p>
        </div>

        <section aria-label="Google sign-in" className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          {googleError && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">{googleError.title}</p>
              {googleError.message && <p className="mt-1 leading-relaxed">{googleError.message}</p>}
            </div>
          )}
          <Button type="button" className="min-h-12 w-full" onClick={startGoogleLogin}>
            Continue with Google
          </Button>
        </section>
      </div>
    </main>
  )
}
