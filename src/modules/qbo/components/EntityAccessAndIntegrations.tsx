import { useContext, useEffect, useState } from 'react'
import { apiRequest } from '../../../api/finopsApi'
import { AuthContext, type AccessGrant } from '../../auth/AuthContext'
import { permissionName } from '../../auth/accessLabels'

type Integration = {
  key_id: string
  name: string
  secret_suffix: string | null
  owner_user_id: string
  owner_name: string | null
  owner_email: string
  expires_at: string | null
  access: Pick<AccessGrant, 'operation' | 'client_id' | 'environment'>[]
}
type Response = { can_view_others: boolean; items: Integration[] }

const accessLabels = (grants: Integration['access']) => {
  const operations = new Set(grants.map((grant) => grant.operation))
  const labels: string[] = []
  if (operations.has('qbo.entity.read')) labels.push(operations.has('qbo.entity.edit') ? 'Read and Edit QBO' : 'Read QBO')
  else {
    if (operations.has('client.read')) labels.push(grants.some((grant) => grant.operation.startsWith('qbo.') && grant.operation !== 'qbo.entity.edit') ? 'Entity details' : 'Entity details only (no QBO data)')
    if (operations.has('qbo.entity.edit')) labels.push('Edit QBO (legacy; no Read QBO)')
  }
  for (const grant of grants.filter((grant) => !['client.read', 'qbo.entity.read', 'qbo.entity.edit'].includes(grant.operation))) {
    labels.push(`${permissionName(grant.operation)}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Production' : 'Sandbox'}` : ''}`)
  }
  return [...new Set(labels)]
}

export function EntityAccessSummary({ clientId }: { clientId: string }) {
  const auth = useContext(AuthContext)
  if (auth?.kind !== 'google') return null

  const grants = (auth.access?.effective_grants ?? []).filter((grant) =>
    (grant.client_id === clientId || grant.client_id === null)
      && ['client.read', 'qbo.entity.read', 'qbo.entity.edit'].includes(grant.operation)
  )
  const entityActions = [
    grants.some((grant) => grant.operation === 'qbo.entity.read') && 'read',
    grants.some((grant) => grant.operation === 'qbo.entity.edit') && 'edit',
  ].filter((action): action is string => Boolean(action))
  const actionText = entityActions.length > 1
    ? `${entityActions.slice(0, -1).join(', ')} and ${entityActions.at(-1)}`
    : entityActions[0]
  return <div className="min-w-0" aria-label="Your access to this entity">
    <p className="text-xs font-medium text-slate-500">Your access</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{actionText ? `Can ${actionText} QuickBooks data for this entity` : grants.some((grant) => grant.operation === 'client.read') ? 'Can view this entity in FinOps' : 'No access assigned for this entity'}</p>
  </div>
}

export function EntityIntegrations({ clientId }: { clientId: string }) {
  const auth = useContext(AuthContext)
  const [response, setResponse] = useState<Response | null>(null)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const isGoogle = auth?.kind === 'google'

  useEffect(() => {
    if (!isGoogle || !clientId) return
    let active = true
    void apiRequest<Response>(`/access/clients/${clientId}/integrations`)
      .then((data) => { if (active) setResponse(data) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [clientId, isGoogle])

  if (!isGoogle) return null
  const items = (response?.items ?? []).filter((item) => filter === 'all' || item.owner_user_id === auth.access?.user.id)
  const showOwners = response?.can_view_others ?? false
  const columns = showOwners
    ? 'sm:grid-cols-[minmax(9rem,1.35fr)_minmax(8rem,1fr)_minmax(10rem,1fr)_minmax(8rem,0.9fr)]'
    : 'sm:grid-cols-[minmax(9rem,1.5fr)_minmax(10rem,1fr)_minmax(8rem,0.9fr)]'

  const integrationRow = (item: Integration) => <li key={item.key_id} className={`grid gap-1.5 px-6 py-3 sm:items-center sm:gap-5 ${columns}`}>
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="truncate text-sm font-semibold text-slate-900">{item.name}</span>
        <span className="font-mono text-xs text-slate-500">••••{item.secret_suffix ?? '—'}</span>
      </div>
    </div>
    {showOwners && <p className="truncate text-sm text-slate-600" title={item.owner_email}>{item.owner_user_id === auth.access?.user.id ? 'You' : item.owner_name || item.owner_email}</p>}
    <p className="text-sm text-slate-700">{accessLabels(item.access).join(' · ') || 'No access listed'}</p>
    <p className="text-sm tabular-nums text-slate-600">{item.expires_at ? new Date(item.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</p>
  </li>

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="entity-integrations">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="entity-integrations" className="text-lg font-semibold text-slate-900">Integrations</h2>
          {response && <span className="text-xs text-slate-500">{items.length} active {items.length === 1 ? 'key' : 'keys'}</span>}</div>
        {response?.can_view_others && <div className="inline-flex rounded-lg border border-slate-200 p-1" aria-label="Integration owners">
          <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={`rounded-md px-3 py-1.5 text-sm ${filter === 'all' ? 'bg-hq-teal text-white' : 'text-slate-600 hover:bg-slate-50'}`}>All</button>
          <button type="button" onClick={() => setFilter('mine')} aria-pressed={filter === 'mine'} className={`rounded-md px-3 py-1.5 text-sm ${filter === 'mine' ? 'bg-hq-teal text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Mine</button>
        </div>}
      </div>
      {error ? <p role="alert" className="border-t border-slate-100 px-6 py-5 text-sm text-rose-700">Integrations could not be loaded. Try refreshing the page.</p>
        : !response ? <p className="border-t border-slate-100 px-6 py-5 text-sm text-slate-600">Loading integrations…</p>
          : !items.length ? <p className="border-t border-slate-100 px-6 py-5 text-sm text-slate-600">{filter === 'mine' ? 'You have no active integrations for this entity.' : 'No active integrations for this entity.'}</p>
            : <div className="border-t border-slate-200">
              <div className={`hidden gap-5 bg-slate-50 px-6 py-2 text-xs font-medium text-slate-500 sm:grid ${columns}`}>
                <span>Key</span>{showOwners && <span>Owner</span>}<span>Access here</span><span>Expires</span>
              </div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">{items.map(integrationRow)}</ul>
            </div>}
    </section>
}
