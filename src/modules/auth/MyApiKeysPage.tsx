import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiRequest } from '../../api/finopsApi'
import { useAuth } from './useAuth'
import type { AccessGrant } from './AuthContext'

type Key = {
  id: string; owner_user_id: string; name: string; secret_suffix: string | null
  status: string; created_at: string; expires_at: string | null; last_used_at: string | null
  revoked_at: string | null; replaces_key_id: string | null
}
type IssuedKey = Key & { secret: string }
type Policy = { active_limit: number; active_count: number; maximum_expiration_days: number; rotation_overlap_days: number }
type KeyGrant = AccessGrant & { api_key_id: string | null }
type Client = { id: string; name: string }
type Pending = { kind: 'rotate' | 'revoke'; key: Key } | null

const administrative = new Set(['users.admin', 'grants.admin', 'keys.admin', 'activity.read'])
const operationNames: Record<string, string> = {
  'client.read': 'View entities', 'client.create': 'Create entities',
  'client.update': 'Edit entities', 'client.delete': 'Delete entities',
  'qbo.read': 'Read QuickBooks data', 'connection.read': 'View connection',
  'connection.connect': 'Connect QuickBooks', 'connection.check': 'Check connection',
  'connection.rotate': 'Renew connection',
}
const grantKey = (grant: AccessGrant) => `${grant.operation}|${grant.client_id ?? ''}|${grant.environment ?? ''}`
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Never'
const keyState = (key: Key) => key.revoked_at || key.status !== 'active' ? 'Revoked'
  : key.expires_at && new Date(key.expires_at).getTime() <= Date.now() ? 'Expired' : 'Active'
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Request failed'

export function MyApiKeysPage() {
  const { access, kind } = useAuth()
  const [keys, setKeys] = useState<Key[]>([])
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [grants, setGrants] = useState<Record<string, KeyGrant[]>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const createDialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)

  useEffect(() => {
    const dialog = createDialogRef.current
    if (!dialog) return
    if (createOpen || issued) {
      if (!dialog.open) {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      if (createOpen && !issued) nameRef.current?.focus()
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      setName('')
      setExpiresOn('')
      setSelected([])
      setError(null)
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [createOpen, issued])

  const available = (access?.effective_grants ?? []).filter((grant) => !administrative.has(grant.operation))
    .filter((grant, index, all) => all.findIndex((candidate) => grantKey(candidate) === grantKey(grant)) === index)
  const label = (grant: AccessGrant) => [operationNames[grant.operation] ?? grant.operation,
    grant.client_id ? clients.find((client) => client.id === grant.client_id)?.name ?? `Entity ${grant.client_id.slice(0, 8)}` : 'All entities',
    grant.environment === 'prod' ? 'Production' : grant.environment === 'sandbox' ? 'Sandbox' : null,
  ].filter(Boolean).join(' · ')

  const refresh = async () => {
    const [listed, currentPolicy] = await Promise.all([
      apiRequest<Key[]>('/access/keys'), apiRequest<Policy>('/access/keys/policy'),
    ])
    const keyGrants = await Promise.all(listed.map((key) =>
      apiRequest<KeyGrant[]>(`/access/grants?api_key_id=${key.id}`)))
    setKeys(listed)
    setPolicy(currentPolicy)
    setGrants(Object.fromEntries(listed.map((key, index) => [key.id, keyGrants[index]])))
  }

  useEffect(() => {
    if (kind !== 'google') return
    let active = true
    void refresh().catch((cause) => { if (active) setError(errorText(cause)) })
      .finally(() => { if (active) setLoading(false) })
    if (access?.effective_grants.some((grant) => grant.operation === 'client.read')) {
      void apiRequest<Client[]>('/clients').then((value) => { if (active) setClients(value) }).catch(() => {})
    }
    return () => { active = false }
  // Initial session identity determines which owner's records are loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, access?.user.id])

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null)
    try { await work() } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (!selected.length) { setError('Choose at least one permission.'); return }
    void run(async () => {
      let result: IssuedKey
      try {
        result = await apiRequest<IssuedKey>('/access/keys', {
          method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ name: name.trim(), expires_at: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null }),
        })
      } catch (cause) {
        throw new Error(`Could not confirm issuance. Check your key list before trying again. ${errorText(cause)}`)
      }
      setIssued(result)
      setCreateOpen(false)
      let failed = 0
      for (const scope of available.filter((grant) => selected.includes(grantKey(grant)))) {
        try {
          await apiRequest('/access/grants', { method: 'POST', body: JSON.stringify({
            api_key_id: result.id, client_id: scope.client_id, environment: scope.environment,
            operation: scope.operation,
          }) })
        } catch { failed += 1 }
      }
      setName(''); setExpiresOn(''); setSelected([])
      await refresh()
      setNotice(failed ? `Key created, but ${failed} permission${failed === 1 ? '' : 's'} could not be assigned. Review its permissions before using it.` : 'Key created. Save the secret now; it cannot be shown again.')
    })
  }

  const addGrant = (key: Key, scopeKey: string) => void run(async () => {
    const scope = available.find((grant) => grantKey(grant) === scopeKey)
    if (!scope) return
    await apiRequest('/access/grants', { method: 'POST', body: JSON.stringify({
      api_key_id: key.id, client_id: scope.client_id, environment: scope.environment, operation: scope.operation,
    }) })
    await refresh()
    setNotice('Permission added.')
  })

  const removeGrant = (grant: KeyGrant) => void run(async () => {
    await apiRequest(`/access/grants/${grant.id}`, { method: 'DELETE' })
    await refresh()
    setNotice('Permission removed.')
  })

  const confirmPending = () => {
    if (!pending) return
    const { key, kind: action } = pending
    setPending(null)
    void run(async () => {
      if (action === 'revoke') {
        await apiRequest(`/access/keys/${key.id}/revoke`, { method: 'POST' })
        await refresh()
        setNotice('Key revoked. Requests using it are now rejected.')
        return
      }
      let result: IssuedKey
      try {
        result = await apiRequest<IssuedKey>(`/access/keys/${key.id}/rotate`, {
          method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ name: key.name, expires_at: null }),
        })
      } catch (cause) {
        throw new Error(`Could not confirm rotation. Check your key list before trying again. ${errorText(cause)}`)
      }
      setIssued(result)
      await refresh()
      setNotice('Replacement key created with your still-valid permissions. Save its secret and update the consumer before the old key expires.')
    })
  }

  if (kind !== 'google') return <p className="text-sm text-slate-700">Sign in with an approved Google account to manage your keys.</p>
  return <div className="mx-auto max-w-6xl space-y-5">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-hq-teal">FinOps Console</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">My API keys</h1><p className="mt-1 text-sm text-slate-600">Keys belong to your account. Their names help you recognize them; access comes from the permissions below.</p></div>
    {error && !createOpen && !issued && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && !issued && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {policy && <p className="text-sm text-slate-700">{policy.active_count} of {policy.active_limit} active keys. Rotation counts both keys during the {policy.rotation_overlap_days}-day overlap.</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="text-lg font-semibold">Your keys</h2><button type="button" disabled={loading || busy || !available.length || !!policy && policy.active_count >= policy.active_limit} onClick={() => { setError(null); setCreateOpen(true) }} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create API key</button></div>{loading ? <p className="p-4 text-sm">Loading keys...</p> : !keys.length ? <p className="p-4 text-sm text-slate-600">You have no managed API keys yet.</p> : <div className="divide-y divide-slate-100">{keys.map((key) => { const state = keyState(key); const assigned = grants[key.id] ?? []; const days = key.expires_at ? Math.ceil((new Date(key.expires_at).getTime() - Date.now()) / 86_400_000) : null; return <div key={key.id} className="p-4"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><div className="min-w-48 flex-1"><p className="font-semibold text-slate-900">{key.name} <span className="ml-1 font-mono text-sm font-normal text-slate-500">{key.secret_suffix ? `••••${key.secret_suffix}` : 'suffix unavailable'}</span></p><p className="text-xs text-slate-600">Created {dateLabel(key.created_at)} · Expires {dateLabel(key.expires_at)} · Last used {key.last_used_at ? dateLabel(key.last_used_at) : 'Never'}</p></div><span className="text-sm font-medium">{state}</span>{state === 'Active' && <><button type="button" disabled={busy} onClick={() => setPending({ kind: 'rotate', key })} className="text-sm font-medium text-hq-teal">Rotate</button><button type="button" disabled={busy} onClick={() => setPending({ kind: 'revoke', key })} className="text-sm font-medium text-rose-700">Revoke</button></>}<button type="button" onClick={() => setEditing(editing === key.id ? null : key.id)} className="text-sm text-slate-700">{editing === key.id ? 'Hide permissions' : 'Permissions'}</button></div>{state === 'Active' && days !== null && [30, 14, 7].some((threshold) => days <= threshold) && <p className="mt-1 text-xs text-amber-800">Expires in {days} day{days === 1 ? '' : 's'}. Rotate it and update its consumer before expiry.</p>}{editing === key.id && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3"><p className="text-xs font-semibold text-slate-600">Assigned permissions</p>{assigned.length ? assigned.map((grant) => <div key={grant.id} className="flex items-center justify-between gap-2 text-sm"><span>{label(grant)}</span>{state === 'Active' && <button type="button" disabled={busy} onClick={() => removeGrant(grant)} className="text-rose-700">Remove</button>}</div>) : <p className="text-sm text-slate-600">No permissions. This key cannot access governed operations.</p>}{state === 'Active' && <select aria-label={`Add permission to ${key.name}`} defaultValue="" disabled={busy} onChange={(event) => { addGrant(key, event.target.value); event.target.value = '' }} className="max-w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="">Add a permission...</option>{available.filter((grant) => !assigned.some((existing) => grantKey(existing) === grantKey(grant))).map((grant) => <option key={grantKey(grant)} value={grantKey(grant)}>{label(grant)}</option>)}</select>}</div>}</div> })}</div>}</section>
    <dialog ref={createDialogRef} aria-label={issued ? 'New API key secret' : 'Create API key'} onCancel={(event) => { if (busy || issued) event.preventDefault(); else setCreateOpen(false) }} className="fixed left-1/2 top-1/2 m-0 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm">
      {issued ? <div className="space-y-4 p-6"><h2 className="text-lg font-semibold">Save this API key now</h2><p className="text-sm text-slate-600">This is the only time the complete secret is shown. Do not put it in code or logs.</p><code className="block break-all rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="new-key-secret">{issued.secret}</code>{busy && <p role="status" className="text-sm text-slate-600">Finishing key setup...</p>}{notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end"><button type="button" disabled={busy} onClick={() => setIssued(null)} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">I saved it</button></div></div> : <form onSubmit={create} className="space-y-4 p-6"><div><h2 className="text-lg font-semibold">Create an API key</h2><p className="mt-1 text-sm text-slate-600">Give it a recognizable name and choose only the access it needs.</p></div>{error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{error}</p>}<label className="block text-sm">Name<input ref={nameRef} aria-label="Key name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bills Automation" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm">Expires on (optional, max {policy?.maximum_expiration_days ?? 120} days)<input aria-label="Expires on" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><fieldset><legend className="text-sm font-medium">Permissions for this key</legend><p className="text-xs text-slate-600">Only permissions you currently hold are available.</p><div className="mt-2 max-h-44 space-y-1 overflow-auto">{available.map((grant) => <label key={grantKey(grant)} className="flex gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"><input type="checkbox" checked={selected.includes(grantKey(grant))} onChange={(event) => setSelected((current) => event.target.checked ? [...current, grantKey(grant)] : current.filter((value) => value !== grantKey(grant)))} />{label(grant)}</label>)}</div></fieldset><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={busy} onClick={() => setCreateOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Cancel</button><button type="submit" disabled={busy || !selected.length} className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creating...' : 'Create key'}</button></div></form>}
    </dialog>
    {pending && <div role="dialog" aria-modal="true" aria-label={pending.kind === 'revoke' ? 'Revoke key' : 'Rotate key'} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-semibold">{pending.kind === 'revoke' ? 'Revoke this key?' : 'Rotate this key?'}</h2><p className="mt-2 text-sm text-slate-700">{pending.kind === 'revoke' ? `${pending.key.name} will stop working immediately. Check consumer impact first.` : `A replacement for ${pending.key.name} will be issued. Both keys count toward your limit; the old key expires within seven days.`}</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPending(null)} className="rounded-lg border px-3 py-2 text-sm">Cancel</button><button type="button" onClick={confirmPending} className="rounded-lg bg-hq-teal px-3 py-2 text-sm font-semibold text-white">Confirm</button></div></div></div>}
  </div>
}
