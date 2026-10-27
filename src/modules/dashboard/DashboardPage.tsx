import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, Building2, CheckCircle2 } from 'lucide-react'
import { apiRequest } from '../../api/finopsApi'
import { Alert } from '../../components/Alert'
import { Card } from '../../components/Card'
import { InfoTooltip } from '../../components/InfoTooltip'
import { useAuth } from '../auth/useAuth'

type Overview = {
  activeClients: number
  clientGroups: number
  demo: boolean
  connected: number
  disconnected: number
  notChecked: number
  unavailable: number
  noCredential: number
  disconnectedClients: { id: string; name: string; environment: string }[]
  partial: boolean
}

export function DashboardPage() {
  const { role } = useAuth()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (role !== 'admin') return
    let mounted = true
    apiRequest<Overview>('/overview')
      .then((data) => { if (mounted) setOverview(data) })
      .catch(() => { if (mounted) setError('Saved connection status could not be loaded.') })
    return () => { mounted = false }
  }, [role])

  const needsVerification = overview
    ? overview.notChecked + overview.unavailable + overview.noCredential
    : 0
  const allConnected = overview && overview.activeClients > 0 && overview.disconnected === 0 && needsVerification === 0

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2 py-1">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Financial operations overview</h1>
        <InfoTooltip
          label="About financial operations overview"
          text="A high-level view of your financial operations, including clients, integrations, and items from the QBO Gateway"
          align="right"
        />
      </header>

      {role !== 'admin' ? (
        <Card title="Connection overview" description="Administrator access is required to view client connection information.">
          <p className="text-sm text-slate-600">Contact an administrator if you need access.</p>
        </Card>
      ) : (
        <Card
          title={<Link to="/qbo/clients" className="inline-flex items-center rounded-sm hover:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">Clients &amp; Integrations</Link>}
          titleSuffix={<InfoTooltip label="About connection results" text="Summary of QuickBooks connections by status." />}
        >
          {error && <Alert title="Overview unavailable" description={error} variant="error" />}
          {!error && !overview && <p className="text-sm text-slate-600" role="status">Loading saved connection status...</p>}
          {overview && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Clients" value={overview.clientGroups} icon={<Building2 className="h-5 w-5" />} />
                <Stat label="Entities" value={overview.activeClients} icon={<Building2 className="h-5 w-5" />} />
                <Stat label="Connected QuickBooks connections" value={overview.connected} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
                <Stat label="Reconnection needed" value={overview.disconnected} icon={<AlertCircle className="h-5 w-5" />} attention={overview.disconnected > 0} />
              </div>

              {overview.partial && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                  Some entity details could not be loaded. Their connection state is unavailable, not confirmed disconnected.
                </div>
              )}

              {overview.disconnectedClients.length > 0 && (
                <section aria-labelledby="disconnected-heading">
                  <h2 id="disconnected-heading" className="text-sm font-semibold text-slate-900">Connections needing attention</h2>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {overview.disconnectedClients.slice(0, 5).map((client) => (
                      <li key={`${client.id}-${client.environment}`}>
                        <Link to={`/qbo/clients/${client.id}`} aria-label={`View ${client.name} detail`} className="group flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-hq-teal">
                          <span className="font-medium">{client.name}</span>
                          <span className="flex items-center gap-1 text-hq-teal"><span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View detail</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {overview.disconnectedClients.length > 5 && <p className="mt-2 text-xs text-slate-500">{overview.disconnectedClients.length - 5} more connections need reconnection.</p>}
                </section>
              )}

              {needsVerification > 0 && (
                <Link to="/qbo/clients?connection=unavailable" aria-label={`View ${needsVerification} unavailable connections`} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:border-hq-teal/40 hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{needsVerification} unavailable</p>
                    <p className="mt-1">View affected entities to see whether a credential is missing, unchecked, or unavailable.</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-hq-teal"><span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View entities</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
                </Link>
              )}
              {allConnected && <p className="text-sm text-slate-700">All saved connection states are connected.</p>}
              {overview.activeClients === 0 && <p className="text-sm text-slate-600">No active entities are available in this environment.</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, icon, attention = false, tone }: { label: string; value: number; icon: ReactNode; attention?: boolean; tone?: 'success' }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className={`flex items-center gap-2 text-sm font-medium ${attention ? 'text-amber-700' : tone === 'success' ? 'text-emerald-700' : 'text-slate-600'}`}>{icon}{label}</div>
      <p className={`mt-auto pt-3 text-3xl font-semibold tabular-nums ${tone === 'success' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
