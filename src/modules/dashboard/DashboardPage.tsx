import { Link } from 'react-router-dom'
import { Activity, PlugZap } from 'lucide-react'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { useAuth } from '../auth/useAuth'

export function DashboardPage() {
  const { role } = useAuth()

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 md:p-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Finance team</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
            Financial operations control center
          </h1>
          <p className="text-slate-600 mt-2 max-w-2xl">
            Manage QuickBooks clients and integrations from one secure workspace.
          </p>
          {role === 'admin' && <div className="mt-4 flex gap-3">
            <Button asChild>
              <Link to="/qbo/clients">Open Clients & Integrations</Link>
            </Button>
          </div>}
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-hq-teal to-emerald-400 text-white p-6 shadow-soft w-full md:w-72">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm opacity-80">System health</p>
              <p className="text-xl font-semibold">Monitoring active</p>
            </div>
          </div>
          <p className="text-sm opacity-80 mt-3">
            Current gateway availability remains visible in the status panel.
          </p>
        </div>
      </div>

      <Card title="Clients & Integrations" description="QuickBooks connection management">
        <div className="flex items-center justify-between gap-4">
          <div className="h-11 w-11 rounded-xl bg-hq-teal/10 text-hq-teal flex items-center justify-center">
            <PlugZap className="h-5 w-5" />
          </div>
          {role === 'admin' ? (
            <Button asChild variant="secondary">
              <Link to="/qbo/clients">Open</Link>
            </Button>
          ) : (
            <p className="text-sm text-slate-500">Administrator access is required.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
