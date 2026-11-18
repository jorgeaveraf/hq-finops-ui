import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'
import { listClients, type QboClient } from '../qbo/api/qboGatewayClient'

type AccessUser = {
  id: string
  email: string
  display_name: string | null
  role: 'Viewer' | 'Operator' | 'Admin'
  status: 'active' | 'disabled'
  issuer: string | null
  sub: string | null
}
type Grant = { id: string; user_id: string | null; client_id: string | null; environment: string | null; operation: string }
const roles = ['Viewer', 'Operator', 'Admin'] as const
const operations = [
  { value: 'client.read', label: 'View entities', roles: roles },
  { value: 'client.update', label: 'Edit / activate / deactivate entity', roles: ['Operator', 'Admin'] },
  { value: 'client.delete', label: 'Permanently delete entity', roles: ['Admin'] },
  { value: 'qbo.read', label: 'Read QuickBooks data', roles: roles, environment: true },
  { value: 'users.admin', label: 'Manage users', roles: ['Admin'], global: true },
  { value: 'grants.admin', label: 'Manage grants', roles: ['Admin'], global: true },
  { value: 'activity.read', label: 'Read Activity', roles: ['Admin'], global: true },
  { value: 'keys.admin', label: 'Administer keys', roles: ['Admin'], global: true },
]

export function AccessAdministrationPage() {
  const { access } = useAuth()
  const canManageGrants = access?.effective_grants.some((grant) => grant.operation === 'grants.admin' && !grant.client_id && !grant.environment) ?? false
  const [users, setUsers] = useState<AccessUser[]>([])
  const [clients, setClients] = useState<QboClient[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AccessUser['role']>('Viewer')
  const [operation, setOperation] = useState('client.read')
  const [clientId, setClientId] = useState('')
  const [environment, setEnvironment] = useState('sandbox')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selectedUser = users.find((user) => user.id === selected)
  const selectedUserRole = selectedUser?.role
  const availableOperations = operations.filter((item) => selectedUser && item.roles.some((allowed) => allowed === selectedUser.role))
  const chosenOperation = operations.find((item) => item.value === operation)

  const refreshUsers = async () => {
    const result = await apiRequest<AccessUser[]>('/access/users')
    setUsers(result)
    return result
  }
  const refreshGrants = async (userId: string) => setGrants(await apiRequest<Grant[]>(`/access/grants?user_id=${userId}`))

  useEffect(() => {
    void refreshUsers().catch((err: Error) => setError(err.message))
    void listClients().then(setClients).catch(() => setClients([]))
  }, [])
  useEffect(() => {
    if (selected) void refreshGrants(selected).catch((err: Error) => setError(err.message))
    else setGrants([])
  }, [selected])
  useEffect(() => {
    if (selectedUserRole && operations.some((item) => item.value === operation && item.roles.some((allowed) => allowed === selectedUserRole))) return
    setOperation(operations.find((item) => item.roles.some((allowed) => allowed === selectedUserRole))?.value || 'client.read')
  }, [selectedUserRole, operation])

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null)
    try { await task() } catch (err) { setError(err instanceof Error ? err.message : 'Request failed') }
    finally { setBusy(false) }
  }
  const addUser = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const created = await apiRequest<AccessUser>('/access/users', {
        method: 'POST', body: JSON.stringify({ email: email.trim(), role }),
      })
      await refreshUsers()
      setSelected(created.id)
      setEmail('')
      setNotice('Access approved. The Google identity will be linked on first sign-in. Assign entity permissions below.')
    })
  }
  const updateUser = (user: AccessUser, changes: { role?: AccessUser['role']; status?: AccessUser['status'] }) => void run(async () => {
    await apiRequest(`/access/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(changes) })
    await refreshUsers()
    setNotice('User updated.')
  })
  const addGrant = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !chosenOperation) return
    void run(async () => {
      await apiRequest('/access/grants', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selected,
          operation,
          client_id: chosenOperation.global || !clientId ? null : clientId,
          environment: chosenOperation.environment ? environment : null,
        }),
      })
      await refreshGrants(selected)
      setNotice('Permission granted.')
    })
  }
  const removeGrant = (grant: Grant) => void run(async () => {
    await apiRequest(`/access/grants/${grant.id}`, { method: 'DELETE' })
    if (selected) await refreshGrants(selected)
    setNotice('Permission removed.')
  })

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-hq-teal">FinOps Console</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">People and access</h1><p className="mt-2 text-sm text-slate-600">Only people approved here can sign in with Google. Roles limit the type of action; grants limit its scope.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={addUser} className="rounded-2xl bg-white p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-slate-900">Approve a person</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <label className="text-sm font-medium text-slate-700">Google email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">Role<select value={role} onChange={(event) => setRole(event.target.value as AccessUser['role'])} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{roles.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button disabled={busy} className="self-end rounded-lg bg-hq-teal px-4 py-2 font-semibold text-white disabled:opacity-50">Approve</button>
      </div>
    </form>
    <div className="rounded-2xl bg-white p-6 shadow-soft"><h2 className="text-lg font-semibold text-slate-900">Registered people</h2><div className="mt-4 space-y-2">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><button type="button" onClick={() => setSelected(user.id)} className="min-w-0 flex-1 text-left text-sm font-medium text-hq-teal underline-offset-2 hover:underline">{user.display_name || user.email}<span className="block font-normal text-slate-600">{user.email} · {user.sub ? 'Google linked' : 'Awaiting first sign-in'}</span></button><select aria-label={`Role for ${user.email}`} title={user.id === access?.user.id ? 'Another administrator must change your role' : undefined} value={user.role} disabled={busy || user.id === access?.user.id} onChange={(event) => updateUser(user, { role: event.target.value as AccessUser['role'] })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">{roles.map((item) => <option key={item}>{item}</option>)}</select><span className="text-sm text-slate-600">{user.status}</span><button type="button" disabled={busy || user.id === access?.user.id} onClick={() => updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">{user.status === 'active' ? 'Disable' : 'Enable'}</button></div>)}</div></div>
    {selectedUser && <div className="rounded-2xl bg-white p-6 shadow-soft"><h2 className="text-lg font-semibold text-slate-900">Permissions for {selectedUser.display_name || selectedUser.email}</h2><p className="mt-1 text-sm text-slate-600">An entity-wide grant applies to both sandbox and production. Financial reads require an environment.</p><div className="mt-4 space-y-2">{grants.map((grant) => <div key={grant.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{grant.operation} · {clients.find((client) => client.id === grant.client_id)?.name || (grant.client_id || 'Global')} · {grant.environment || 'Both environments'}</span>{canManageGrants && <button type="button" disabled={busy} onClick={() => removeGrant(grant)} className="font-medium text-rose-700 disabled:opacity-50">Remove</button>}</div>)}</div>{canManageGrants && <form onSubmit={addGrant} className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-4"><label className="text-sm">Operation<select value={operation} onChange={(event) => setOperation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">{availableOperations.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="text-sm">Entity<select value={clientId} disabled={chosenOperation?.global} onChange={(event) => setClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"><option value="">Global</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="text-sm">Environment<select value={environment} disabled={!chosenOperation?.environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"><option value="sandbox">Sandbox</option><option value="prod">Production</option></select></label><button disabled={busy || (chosenOperation?.environment && !clientId)} className="self-end rounded-lg bg-hq-teal px-3 py-2 font-semibold text-white disabled:opacity-50">Add grant</button></form>}</div>}
  </div>
}
