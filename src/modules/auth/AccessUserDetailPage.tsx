import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { listClients, type QboClient } from '../qbo/api/qboGatewayClient'
import { useAuth } from './useAuth'

type AccessUser = {
  id: string; email: string; display_name: string | null; role: 'Viewer' | 'Operator' | 'Admin'
  status: 'active' | 'disabled'; issuer: string | null; sub: string | null
}
type Grant = { id?: string; user_id?: string | null; client_id: string | null; environment: string | null; operation: string }
type GrantDraft = Pick<Grant, 'operation' | 'client_id' | 'environment'>
type Preview = { fingerprint: string; affected_keys?: unknown[]; suspended_keys?: unknown[]; changes?: unknown[]; [key: string]: unknown }
const roles = ['Viewer', 'Operator', 'Admin'] as const
type Operation = { value: string; label: string; roles: readonly AccessUser['role'][]; environment?: boolean; global?: boolean }
const operations: Operation[] = [
  { value: 'client.read', label: 'View entities', roles },
  { value: 'client.update', label: 'Edit / activate / deactivate entity', roles: ['Operator', 'Admin'] },
  { value: 'client.delete', label: 'Permanently delete entity', roles: ['Admin'] },
  { value: 'qbo.read', label: 'Read QuickBooks data', roles, environment: true },
  { value: 'users.admin', label: 'Manage users', roles: ['Admin'], global: true },
  { value: 'grants.admin', label: 'Manage grants', roles: ['Admin'], global: true },
  { value: 'activity.read', label: 'Read Activity', roles: ['Admin'], global: true },
  { value: 'keys.admin', label: 'Administer keys', roles: ['Admin'], global: true },
]
const grantKey = (grant: GrantDraft) => `${grant.operation}|${grant.client_id ?? ''}|${grant.environment ?? ''}`
const itemLabel = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)

export function AccessUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>()
  const { access } = useAuth()
  const [user, setUser] = useState<AccessUser | null>(null)
  const [clients, setClients] = useState<QboClient[]>([])
  const [role, setRole] = useState<AccessUser['role']>('Viewer')
  const [status, setStatus] = useState<AccessUser['status']>('active')
  const [grants, setGrants] = useState<GrantDraft[]>([])
  const [operation, setOperation] = useState('client.read')
  const [clientId, setClientId] = useState('')
  const [environment, setEnvironment] = useState('sandbox')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [acknowledge, setAcknowledge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isSelf = user?.id === access?.user.id
  const chosenOperation = operations.find((item) => item.value === operation)
  const availableOperations = useMemo(() => operations.filter((item) => item.roles.some((allowed) => allowed === role)), [role])
  const suspendedKeys = preview?.suspended_keys ?? []
  const payload = { role, status, grants }

  useEffect(() => {
    let current = true
    void Promise.all([
      apiRequest<AccessUser[]>('/access/users'),
      apiRequest<Grant[]>(`/access/grants?user_id=${encodeURIComponent(userId)}`),
      listClients().catch(() => [] as QboClient[]),
    ]).then(([users, existing, availableClients]) => {
      if (!current) return
      const selected = users.find((item) => item.id === userId)
      if (!selected) { setError('Person not found.'); return }
      setUser(selected); setRole(selected.role); setStatus(selected.status)
      setGrants(existing.map(({ operation: op, client_id, environment: env }) => ({ operation: op, client_id, environment: env })))
      setClients(availableClients)
    }).catch((err: Error) => { if (current) setError(err.message) })
    return () => { current = false }
  }, [userId])

  useEffect(() => {
    if (availableOperations.some((item) => item.value === operation)) return
    setOperation(availableOperations[0]?.value ?? 'client.read')
  }, [availableOperations, operation])

  const invalidatePreview = () => { setPreview(null); setAcknowledge(false); setNotice(null) }
  const addGrant = (event: FormEvent) => {
    event.preventDefault()
    if (!chosenOperation) return
    const grant: GrantDraft = {
      operation,
      client_id: chosenOperation.global || !clientId ? null : clientId,
      environment: chosenOperation.environment ? environment : null,
    }
    if (grants.some((item) => grantKey(item) === grantKey(grant))) return
    invalidatePreview(); setGrants((current) => [...current, grant])
  }
  const removeGrant = (grant: GrantDraft) => {
    invalidatePreview(); setGrants((current) => current.filter((item) => grantKey(item) !== grantKey(grant)))
  }
  const requestPreview = async () => {
    setBusy(true); setError(null); setNotice(null); setPreview(null)
    try {
      const result = await apiRequest<Preview>(`/access/users/${encodeURIComponent(userId)}/policy/preview`, { method: 'POST', body: JSON.stringify(payload) })
      setPreview(result)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to preview this policy.') }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (!preview) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await apiRequest(`/access/users/${encodeURIComponent(userId)}/policy`, { method: 'PUT', body: JSON.stringify({ ...payload, expected_fingerprint: preview.fingerprint, acknowledge_key_suspension: acknowledge }) })
      const refreshed = await apiRequest<AccessUser[]>(`/access/users`)
      const saved = refreshed.find((item) => item.id === userId)
      if (saved) setUser(saved)
      setNotice('Access policy updated.')
      setPreview(null); setAcknowledge(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to apply this policy.') }
    finally { setBusy(false) }
  }

  if (!user) return <div className="mx-auto max-w-5xl space-y-4"><Link to="/access/users" className="text-sm font-medium text-hq-teal hover:underline">← People and access</Link>{error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : <p role="status" className="text-sm text-slate-600">Loading person...</p>}</div>
  return <div className="mx-auto max-w-5xl space-y-6">
    <div><Link to="/access/users" className="text-sm font-medium text-hq-teal hover:underline">← People and access</Link><p className="mt-5 text-xs font-semibold uppercase tracking-wider text-hq-teal">FinOps Console</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{user.display_name || user.email}</h1><p className="mt-1 text-sm text-slate-600">{user.email} · {user.sub ? 'Google linked' : 'Awaiting first sign-in'}</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    {isSelf && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Another administrator must change your role or sign-in status.</p>}
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-soft">
      <div><h2 className="text-lg font-semibold text-slate-900">Stage access policy</h2><p className="mt-1 text-sm text-slate-600">Changes stay staged until you preview their impact and confirm them.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Role<select aria-label="Role" value={role} disabled={isSelf} onChange={(event) => { invalidatePreview(); setRole(event.target.value as AccessUser['role']) }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Sign-in status<select aria-label="Sign-in status" value={status} disabled={isSelf} onChange={(event) => { invalidatePreview(); setStatus(event.target.value as AccessUser['status']) }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="active">Active</option><option value="disabled">Disabled</option></select></label></div>
      <div><h3 className="font-medium text-slate-900">Permissions</h3><p className="mt-1 text-sm text-slate-600">An entity-wide grant applies to both sandbox and production. Financial reads require an environment.</p><div className="mt-3 space-y-2">{grants.map((grant) => <div key={grantKey(grant)} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{grant.operation} · {clients.find((client) => client.id === grant.client_id)?.name || grant.client_id || 'Global'} · {grant.environment || 'Both environments'}</span><button type="button" disabled={busy} onClick={() => removeGrant(grant)} className="shrink-0 font-medium text-rose-700 disabled:opacity-50">Remove</button></div>)}{!grants.length && <p className="text-sm text-slate-600">No grants assigned.</p>}</div>
        <form onSubmit={addGrant} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-4"><label className="text-sm">Operation<select aria-label="Operation" value={operation} onChange={(event) => setOperation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">{availableOperations.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="text-sm">Entity<select aria-label="Entity" value={clientId} disabled={chosenOperation?.global} onChange={(event) => setClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"><option value="">Global</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="text-sm">Environment<select aria-label="Environment" value={environment} disabled={!chosenOperation?.environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"><option value="sandbox">Sandbox</option><option value="prod">Production</option></select></label><button disabled={busy || (chosenOperation?.environment && !clientId)} className="self-end rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-50">Stage grant</button></form>
      </div>
      <div className="border-t border-slate-200 pt-4"><button type="button" disabled={busy} onClick={() => void requestPreview()} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : 'Preview policy changes'}</button></div>
    </section>
    {preview && <section aria-label="Policy impact preview" className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6"><div><h2 className="text-lg font-semibold text-amber-950">Review policy impact</h2><p className="mt-1 text-sm text-amber-900">Review the affected API keys and permission changes before applying.</p></div><ImpactList title="Affected API keys" values={preview.affected_keys} empty="No API keys are affected." /><ImpactList title="Keys that will be suspended" values={preview.suspended_keys} empty="No keys will be suspended." /><ImpactList title="Policy changes" values={preview.changes} empty="No policy differences were reported." />{suspendedKeys.length > 0 && <label className="flex items-start gap-2 text-sm font-medium text-amber-950"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="mt-0.5" />I understand that {suspendedKeys.length} API key(s) will be suspended and may stop working.</label>}<div className="flex flex-wrap items-center gap-3 border-t border-amber-200 pt-4"><button type="button" disabled={busy || suspendedKeys.length > 0 && !acknowledge} onClick={() => void apply()} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm and apply changes</button><button type="button" disabled={busy} onClick={() => { setPreview(null); setAcknowledge(false) }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">Cancel preview</button></div></section>}
  </div>
}

function ImpactList({ title, values, empty }: { title: string; values?: unknown[]; empty: string }) {
  return <div><h3 className="text-sm font-semibold text-amber-950">{title} ({values?.length ?? 0})</h3>{values?.length ? <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-amber-950">{values.map((value, index) => <li key={`${index}-${itemLabel(value)}`}>{itemLabel(value)}</li>)}</ul> : <p className="mt-1 text-sm text-amber-900">{empty}</p>}</div>
}
