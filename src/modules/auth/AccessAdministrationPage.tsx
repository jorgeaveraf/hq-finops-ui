import { useEffect, useState } from 'react'
import { AccessUserEditor, type AccessUser } from './AccessUserDetailPage'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'
import { Plus, Send } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'

export function AccessAdministrationPage() {
  const { access, refreshAccess } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState<AccessUser[]>([])
  const visibleUsers = users.filter((user) => user.id !== access?.user.id)
  const canManageUser = (user: AccessUser) => user.id !== access?.user.id
    && !user.is_super_admin_founder
    && (!user.is_super_admin || access?.user.is_super_admin_founder)
  const editUserId = searchParams.get('edit')
  const selectedUser = users.find((user) => user.id === editUserId && canManageUser(user))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [inviteUser, setInviteUser] = useState<AccessUser | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [suppressInviteHoverFor, setSuppressInviteHoverFor] = useState<string | null>(null)

  const loadUsers = async () => apiRequest<AccessUser[]>('/access/users')
  const sendInvitation = async () => {
    if (!inviteUser) return
    setInviteBusy(true); setInviteError(null)
    try {
      await apiRequest(`/access/users/${encodeURIComponent(inviteUser.id)}/invitation`, { method: 'POST', body: '{}' })
      setInviteUser(null)
      setNotice(inviteUser.invitation_sent_at ? 'Invitation requested again.' : 'Invitation requested.')
      setUsers(await loadUsers())
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invitation could not be confirmed.')
    } finally { setInviteBusy(false) }
  }
  useEffect(() => {
    let active = true
    void Promise.all([loadUsers(), refreshAccess()]).then(([result]) => { if (active) setUsers(result) }).catch((err: Error) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!suppressInviteHoverFor) return
    const revealOnNextMovement = () => setSuppressInviteHoverFor(null)
    window.addEventListener('pointermove', revealOnNextMovement, { once: true })
    return () => window.removeEventListener('pointermove', revealOnNextMovement)
  }, [suppressInviteHoverFor])

  return <div className="access-view mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-1"><h1 className="text-2xl font-semibold text-slate-900">People and access</h1><InfoTooltip label="About People and access" text="Manage other people's sign-in and access." /></div>
      <button type="button" aria-label="Add person" disabled={loading} onClick={() => { setError(null); setNotice(null); setAdding(true) }} className="icon-first-action rounded-lg bg-hq-teal px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus aria-hidden="true" className="h-4 w-4" /><span className="icon-first-label">Add person</span></button>
    </header>
    {error && !adding && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    <section aria-label="People" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">People</h2>{!loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{visibleUsers.length}</span>}</div>
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_7rem_16rem] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-medium text-slate-500 md:grid"><span>Person</span><span>Role</span><span>Sign-in access</span></div>
      {loading && <p role="status" className="p-5 text-sm text-slate-600">Loading people…</p>}
      <div className="divide-y divide-slate-100">{visibleUsers.map((user) => {
        const manageable = canManageUser(user)
        const canInvite = manageable && user.status === 'active' && !user.issuer && !user.sub
        const identity = <><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-hq-teal">{(user.display_name || user.email).slice(0,1).toUpperCase()}</span>
          <div className="min-w-0"><p className={`break-words text-sm font-semibold text-slate-900 ${manageable ? 'group-hover:text-hq-teal' : ''}`}>{user.display_name || user.email}</p>{user.display_name && <p className="mt-0.5 break-words text-xs text-slate-500">{user.email}</p>}{user.is_super_admin_founder && <span className="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-hq-teal">Founder</span>}</div></>
        return <div key={user.id} className="group grid grid-cols-2 items-center gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_7rem_16rem] md:gap-4">
          {manageable ? <Link to={`/access/users?edit=${encodeURIComponent(user.id)}`} aria-label={`Change access for ${user.display_name || user.email}`} className="group col-span-2 flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal md:col-span-1">{identity}</Link>
            : <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">{identity}</div>}
          <span className="text-sm text-slate-700"><span className="mr-1 text-xs text-slate-500 md:hidden">Role:</span>{user.is_super_admin ? 'Superadmin' : user.role}</span>
          <div className="relative flex min-w-0 items-center gap-2">
            <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-medium ${user.status !== 'active' ? 'bg-slate-100 text-slate-600' : user.sub ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'}`}><span className="md:hidden">Sign-in: </span>{user.status !== 'active' ? 'Paused' : user.sub ? 'Allowed' : 'Awaiting sign-in'}</span>
            {canInvite && <button type="button" aria-label={user.invitation_sent_at ? 'Resend invitation' : 'Send invitation'} onClick={() => { setInviteError(null); setInviteUser(user) }} className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-hq-teal hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal md:absolute md:right-0 md:opacity-0 md:transition-opacity md:focus-visible:opacity-100 ${suppressInviteHoverFor === user.id ? '' : 'md:group-hover:opacity-100'}`}><Send aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span>{user.invitation_sent_at ? 'Resend' : 'Send'}</span></button>}
          </div>
        </div>})}</div>
      {!loading && !error && !visibleUsers.length && <div className="p-8 text-center"><p className="font-medium text-slate-900">No other people added yet</p><p className="mt-1 text-sm text-slate-600">Add someone to approve their Google account. Your own access is in <Link to="/access" className="font-medium text-hq-teal hover:underline">My account</Link>.</p></div>}
    </section>
    {adding && <AccessUserEditor key="new-person" creating user={{ id: '', email: '', display_name: null, role: 'Viewer', status: 'active', issuer: null, sub: null }} onClose={() => setAdding(false)} onSaved={(message) => { setAdding(false); setNotice(message || 'Person created.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} onDeleted={() => setAdding(false)} />}
    {!loading && editUserId && !selectedUser && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">This person is no longer available. <button type="button" onClick={() => setSearchParams({}, { replace: true })} className="font-semibold underline">Close</button></p>}
    {selectedUser && <AccessUserEditor key={`${selectedUser.id}:${Boolean(selectedUser.is_super_admin)}`} user={selectedUser} onClose={() => setSearchParams({}, { replace: true })} onSaved={() => { if (selectedUser.status === 'disabled' && !selectedUser.sub) setSuppressInviteHoverFor(selectedUser.id); setSearchParams({}, { replace: true }); setNotice('Access updated.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} onDeleted={() => { setSearchParams({}, { replace: true }); setNotice('Person deleted. Activity history was retained.'); void loadUsers().then(setUsers).catch((err: Error) => setError(err.message)) }} />}
    {inviteUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="invite-confirm-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="invite-confirm-title" className="text-xl font-semibold text-slate-900">{inviteUser.invitation_sent_at ? 'Resend invitation?' : 'Send invitation?'}</h2><p className="mt-2 text-sm text-slate-600">An invitation will be requested for <strong className="break-all font-semibold text-slate-900">{inviteUser.email}</strong>. Their access will stay the same.</p>{inviteError && <p role="alert" className="mt-4 text-sm text-rose-700">{inviteError}</p>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus disabled={inviteBusy} onClick={() => setInviteUser(null)} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">Cancel</button><button type="button" disabled={inviteBusy} onClick={() => void sendInvitation()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Send aria-hidden="true" className="h-4 w-4" />{inviteBusy ? 'Requesting…' : inviteUser.invitation_sent_at ? 'Resend invitation' : 'Send invitation'}</button></div></div></div>}
  </div>
}
