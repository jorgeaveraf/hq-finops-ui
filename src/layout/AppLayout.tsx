import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, UploadCloud, Home, Send } from 'lucide-react'
import { useAuth } from '../modules/auth/useAuth'
import { Button } from '../components/Button'
import { useHealthStatus } from '../hooks/useHealthStatus'

const navItems = [
  { to: '/', label: 'Overview', icon: Home },
  { to: '/ingest/part1', label: 'Bank ingestion (Part 1)', icon: UploadCloud },
  { to: '/ingest/part2', label: 'QBO export (Part 2)', icon: Send },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const { status: healthStatus, message: healthMessage, lastChecked } = useHealthStatus()

  return (
    <div className="min-h-screen bg-hq-gray flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white/90 backdrop-blur-lg shadow-soft">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-hq-teal to-emerald-400 text-white font-semibold flex items-center justify-center">
            HQ
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#178a8a' }}>
              Headquarters
            </p>
            <p className="text-base font-semibold text-slate-900">FinOps Console</p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                    isActive
                      ? 'bg-hq-teal text-white shadow'
                      : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="px-4 py-5 border-t border-slate-100">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-sm text-slate-600">Status</p>
            <p
              className={`text-xs font-semibold ${
                healthStatus === 'healthy'
                  ? 'text-emerald-700'
                  : healthStatus === 'unreachable'
                    ? 'text-rose-600'
                    : 'text-slate-600'
              }`}
            >
              {healthStatus === 'healthy'
                ? 'Ingestion gateway reachable'
                : healthStatus === 'unreachable'
                  ? 'Gateway unreachable'
                  : 'Checking...'}
            </p>
            <p className="text-xs text-slate-500">
              {healthStatus === 'healthy' ? 'Ready for submissions' : healthMessage ?? 'Health probe via /health'}
            </p>
            {lastChecked && (
              <p className="text-[11px] text-slate-400 mt-1">Checked {lastChecked.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white/95 backdrop-blur-lg border-b border-slate-200 px-4 md:px-8 py-3 flex items-center justify-between shadow-sm">
          <div className="md:hidden flex items-center gap-2 font-semibold text-slate-900">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-hq-teal to-emerald-400 text-white font-semibold flex items-center justify-center">
              HQ
            </div>
            FinOps Console
          </div>
          <div className="hidden md:flex items-center gap-2 text-slate-600">
            <span className="text-xs uppercase tracking-wide text-slate-500">Mode</span>
            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {user?.name ?? 'FinOps Operator'}
              </p>
              <p className="text-xs text-slate-500">{user?.email ?? 'operator'}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-hq-teal to-emerald-400 text-white font-semibold flex items-center justify-center">
              {user?.name?.[0]?.toUpperCase() ?? 'F'}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} icon={<LogOut className="h-4 w-4" />}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-10 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
