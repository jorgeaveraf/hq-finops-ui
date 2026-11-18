import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'

type AccessUser = {
  id: string
  email: string
  display_name: string | null
  role: 'Viewer' | 'Operator' | 'Admin'
  status: 'active' | 'disabled'
  issuer: string | null
  sub: string | null
}
const roles = ['Viewer', 'Operator', 'Admin'] as const

export function AccessAdministrationPage() {
  const { access } = useAuth()
  const [users, setUsers] = useState<AccessUser[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AccessUser['role']>('Viewer')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadUsers = async () => apiRequest<AccessUser[]>('/access/users')
  useEffect(() => {
    let active = true
    void loadUsers().then((result) => { if (active) setUsers(result) }).catch((err: Error) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [])

  const addUser = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    void apiRequest<AccessUser>('/access/users', {
      method: 'POST', body: JSON.stringify({ email: email.trim(), role }),
    }).then(async () => {
      setUsers(await loadUsers())
      setEmail('')
      setNotice('Access approved. The Google identity will be linked on first sign-in. Open the person record to review and apply policy changes.')
    }).catch((err: Error) => setError(err.message)).finally(() => setBusy(false))
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-hq-teal">FinOps Console</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">People and access</h1><p className="mt-2 text-sm text-slate-600">Only people approved here can sign in with Google. Roles limit the type of action; grants limit its scope. Changes are reviewed on each person’s detail page.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={addUser} className="rounded-2xl bg-white p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-slate-900">Approve a person</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <label className="text-sm font-medium text-slate-700">Google email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">Initial role<select value={role} onChange={(event) => setRole(event.target.value as AccessUser['role'])} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{roles.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button disabled={busy} className="self-end rounded-lg bg-hq-teal px-4 py-2 font-semibold text-white disabled:opacity-50">Approve</button>
      </div>
    </form>
    <div className="rounded-2xl bg-white p-6 shadow-soft"><h2 className="text-lg font-semibold text-slate-900">Registered people</h2><div className="mt-4 divide-y divide-slate-100">{users.map((user) => <div key={user.id} className="py-3"><Link to={`/access/users/${encodeURIComponent(user.id)}`} className="block rounded-lg text-sm font-medium text-hq-teal hover:underline"><span>{user.display_name || user.email}</span><span className="mt-0.5 block font-normal text-slate-600">{user.email} · {user.role} · {user.status} · {user.sub ? 'Google linked' : 'Awaiting first sign-in'}{user.id === access?.user.id ? ' · You' : ''}</span></Link></div>)}{!users.length && <p className="py-3 text-sm text-slate-600">No approved people yet.</p>}</div></div>
  </div>
}
