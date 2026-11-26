import { useEffect, useState } from 'react'
import { AccessUserEditor, type AccessUser } from './AccessUserDetailPage'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'
import { Plus } from 'lucide-react'

export function AccessAdministrationPage() {
  const { access } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState<AccessUser[]>([])
  const managedUsers = users.filter((user) => user.id !== access?.user.id
    && !user.is_super_admin_founder
    && (!user.is_super_admin || access?.user.is_super_admin_founder))
  const editUserId = searchParams.get('edit')
  const selectedUser = managedUsers.find((user) => user.id === editUserId)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const loadUsers = async () => apiRequest<AccessUser[]>('/access/users')
  useEffect(() => {
    let active = true
    void loadUsers().then((result) => { if (active) setUsers(result) }).catch((err: Error) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return <div className="access-view mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-hq-teal">Administration</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">People and access</h1><p className="mt-2 text-sm text-slate-600">Manage other people's sign-in and access.</p></div>
      <button type="button" aria-label="Add person" disabled={loading} onClick={() => { setError(null); setNotice(null); setAdding(true) }} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Add person</span></button>
    </header>
    {error && !adding && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <section aria-label="People" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">People</h2>{!loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{managedUsers.length}</span>}</div>
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_8rem_9rem] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-medium text-slate-500 md:grid"><span>Person</span><span>Role</span><span>Sign-in access</span></div>
      {loading && <p role="status" className="p-5 text-sm text-slate-600">Loading people…</p>}
      <div className="divide-y divide-slate-100">{managedUsers.map((user) => <div key={user.id} className="grid grid-cols-2 items-center gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_8rem_9rem] md:gap-4">
        <Link to={`/access/users?edit=${encodeURIComponent(user.id)}`} aria-label={`Change access for ${user.display_name || user.email}`} className="group col-span-2 flex min-w-0 items-center gap-3 rounded-lg hover:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal md:col-span-1">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-hq-teal">{(user.display_name || user.email).slice(0,1).toUpperCase()}</span>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900 group-hover:text-hq-teal">{user.display_name || user.email}</p>{user.display_name && <p className="mt-0.5 break-words text-xs text-slate-500">{user.email}</p>}{user.is_super_admin && <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-hq-teal">Superadmin{user.is_super_admin_founder && <span className="rounded-full bg-teal-50 px-2 py-0.5">Founder</span>}</span>}{!user.sub && <p className="mt-1 text-xs text-slate-500">Awaiting first sign-in</p>}</div>
        </Link>
        <span className="text-sm text-slate-700"><span className="mr-1 text-xs text-slate-500 md:hidden">Role:</span>{user.role}</span>
        <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}><span className="md:hidden">Sign-in: </span>{user.status === 'active' ? 'Allowed' : 'Paused'}</span>
      </div>)}</div>
      {!loading && !error && !managedUsers.length && <div className="p-8 text-center"><p className="font-medium text-slate-900">No other people added yet</p><p className="mt-1 text-sm text-slate-600">Add someone to approve their Google account. Your own access is in <Link to="/access" className="font-medium text-hq-teal hover:underline">My account</Link>.</p></div>}
    </section>
    {adding && <AccessUserEditor key="new-person" creating user={{ id: '', email: '', display_name: null, role: 'Viewer', status: 'active', issuer: null, sub: null }} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice('Person added with the selected access.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} onDeleted={() => setAdding(false)} />}
    {!loading && editUserId && !selectedUser && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">This person is no longer available. <button type="button" onClick={() => setSearchParams({}, { replace: true })} className="font-semibold underline">Close</button></p>}
    {selectedUser && <AccessUserEditor key={`${selectedUser.id}:${Boolean(selectedUser.is_super_admin)}`} user={selectedUser} onClose={() => setSearchParams({}, { replace: true })} onSaved={() => { setSearchParams({}, { replace: true }); setNotice('Access updated.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} onDeleted={() => { setSearchParams({}, { replace: true }); setNotice('Person deleted. Activity history was retained.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} />}
  </div>
}
