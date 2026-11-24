import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertCircle, ArrowUpRight, Building2, CheckCircle2, UserRound, Users } from 'lucide-react'
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
type RecentActivity = { action: string; actor: string; actor_name?: string | null; occurred_at: string; status: string }
type ActivitySnapshot = { total: number | null; latest: RecentActivity | null }
type PeopleSnapshot = { total: number; awaiting: number; paused: number }

export function DashboardPage() {
  const { role, kind, access } = useAuth()
  const canReadClients = kind === 'google'
    ? Boolean(access?.effective_grants.some((grant) => ['client.read', 'qbo.entity.read', 'entities.manage'].includes(grant.operation)))
    : role === 'admin'
  const canViewActivity = kind === 'google' && access?.user.role === 'Admin'
    && Boolean(access.effective_grants.some((grant) => grant.operation === 'activity.read' && !grant.client_id && !grant.environment))
  const canManagePeople = kind === 'google' && access?.user.role === 'Admin'
    && Boolean(access.effective_grants.some((grant) => grant.operation === 'access.manage' && !grant.client_id && !grant.environment))
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activitySnapshot, setActivitySnapshot] = useState<ActivitySnapshot | null>(null)
  const [peopleSnapshot, setPeopleSnapshot] = useState<PeopleSnapshot | null>(null)
  const [activityError, setActivityError] = useState(false)
  const [peopleError, setPeopleError] = useState(false)

  useEffect(() => {
    if (!canReadClients) return
    let mounted = true
    apiRequest<Overview>('/overview')
      .then((data) => { if (mounted) setOverview(data) })
      .catch(() => { if (mounted) setError('Saved connection status could not be loaded.') })
    return () => { mounted = false }
  }, [canReadClients])

  useEffect(() => {
    if (!canViewActivity) return
    let mounted = true
    apiRequest<{ total_count?: number | null; items?: RecentActivity[] }>('/access/activity/summary?limit=1&scope=qbo_transactions&page=1')
      .then((data) => { if (mounted) setActivitySnapshot({ total: typeof data.total_count === 'number' ? data.total_count : null, latest: data.items?.[0] ?? null }) })
      .catch(() => { if (mounted) setActivityError(true) })
    return () => { mounted = false }
  }, [canViewActivity])

  useEffect(() => {
    if (!canManagePeople) return
    let mounted = true
    apiRequest<{ id: string; status: string; sub: string | null }[]>('/access/users')
      .then((users) => { if (mounted && Array.isArray(users)) {
        const managed = users.filter((user) => user.id !== access?.user.id)
        setPeopleSnapshot({ total: managed.length, awaiting: managed.filter((user) => user.status === 'active' && !user.sub).length, paused: managed.filter((user) => user.status !== 'active').length })
      } })
      .catch(() => { if (mounted) setPeopleError(true) })
    return () => { mounted = false }
  }, [canManagePeople, access?.user.id])

  const needsVerification = overview
    ? overview.notChecked + overview.unavailable + overview.noCredential
    : 0
  const allConnected = overview && overview.activeClients > 0 && overview.disconnected === 0 && needsVerification === 0

  return (
    <div className="space-y-6">
      <header className="py-1">
        <div className="flex items-center gap-1"><h1 className="text-2xl font-bold leading-none text-slate-900 md:text-3xl">FinOps Console</h1>
        <InfoTooltip
          label="About FinOps Console"
          text="A high-level view of your financial operations, including clients, integrations, and items from the QBO Gateway"
          align="left"
        />
        </div>
        <p className="mt-1 text-sm font-medium text-slate-600">QBO Gateway</p>
      </header>

      {!canReadClients ? (
        <Card title="Connection overview" description="Entity access is required to view connection information.">
          <p className="text-sm text-slate-600">Ask an administrator to assign access to an entity.</p>
        </Card>
      ) : (
        <Card
          title="Clients & Integrations"
          titleSuffix={<InfoTooltip label="About connection results" text="QuickBooks connection status for entities you can access." />}
        >
          {error && <Alert title="Overview unavailable" description={error} variant="error" />}
          {!error && !overview && <p className="text-sm text-slate-600" role="status">Loading saved connection status...</p>}
          {overview && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Clients" value={overview.clientGroups} icon={<Building2 className="h-5 w-5" />} to="/qbo/clients?view=clients" />
                <Stat label="Entities" value={overview.activeClients} icon={<Building2 className="h-5 w-5" />} to="/qbo/clients?view=entities" />
                <Stat label="Connected QuickBooks connections" value={overview.connected} icon={<CheckCircle2 className="h-5 w-5" />} to="/qbo/clients?view=entities&connection=connected" />
                <Stat label="Reconnection needed" value={overview.disconnected} icon={<AlertCircle className="h-5 w-5" />} to="/qbo/clients?view=entities&connection=reconnect-needed" attention={overview.disconnected > 0} />
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
      {(canViewActivity || canManagePeople) && <section aria-label="Administration overview" className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Operations & administration</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {canViewActivity && <Link to="/access/activity" className="group flex min-w-0 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-hq-teal/50 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Activity aria-hidden="true" className="h-4 w-4 text-slate-600" />QBO transactions</div>{activitySnapshot ? <><p className="mt-3 text-xl font-semibold tabular-nums text-slate-900">{activitySnapshot.total === null ? 'Recent QBO transactions' : activitySnapshot.total === 1 ? '1 QBO transaction' : `${activitySnapshot.total} QBO transactions`}</p>{activitySnapshot.latest ? <><p className="mt-2 truncate text-sm font-medium text-slate-800">Latest: {activitySnapshot.latest.action}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><UserRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{activitySnapshot.latest.actor_name || activitySnapshot.latest.actor}</p></> : <p className="mt-2 text-sm text-slate-600">No QBO transactions in the last 15 days.</p>}</> : <p className="mt-3 text-sm text-slate-600">{activityError ? 'Activity summary unavailable.' : 'Loading activity…'}</p>}</div></Link>}
          {canManagePeople && <Link to="/access/users" className="group flex min-w-0 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-hq-teal/50 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Users aria-hidden="true" className="h-4 w-4 text-slate-600" />People and access</div>{peopleSnapshot ? <><p className="mt-3 text-xl font-semibold tabular-nums text-slate-900">{peopleSnapshot.total} {peopleSnapshot.total === 1 ? 'person' : 'people'} managed</p><p className="mt-2 text-sm text-slate-700">{peopleSnapshot.awaiting} awaiting first sign-in · {peopleSnapshot.paused} paused</p></> : <p className="mt-3 text-sm text-slate-600">{peopleError ? 'People summary unavailable.' : 'Loading people…'}</p>}</div></Link>}
        </div>
      </section>}
    </div>
  )
}

function Stat({ label, value, icon, to, attention = false }: { label: string; value: number; icon: ReactNode; to: string; attention?: boolean }) {
  return (
    <Link to={to} className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-hq-teal/50 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
      <div className={`flex items-center gap-2 text-sm font-medium group-hover:text-hq-teal ${attention ? 'text-amber-700' : 'text-slate-600'}`}>{icon}{label}</div>
      <p className="mt-auto pt-3 text-3xl font-semibold tabular-nums text-slate-900 group-hover:text-hq-teal">{value}</p>
    </Link>
  )
}
