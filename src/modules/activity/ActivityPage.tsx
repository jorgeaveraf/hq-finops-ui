import { useEffect, useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import { apiRequest } from '../../api/finopsApi'

type ActivityItem = {
  id: string
  occurred_at: string
  reference_id: string | null
  actor: string
  key_name: string | null
  client_name: string | null
  target_name: string | null
  environment: string | null
  action: string
  category: 'read' | 'create' | 'update' | 'delete' | 'other'
  status: 'completed' | 'denied' | 'failed' | 'unknown'
}
type ActivityPageResponse = { items: ActivityItem[]; next_cursor: string | null }
type Filters = { from: string; to: string; category: string; actorEmail: string }
const emptyFilters: Filters = { from: '', to: '', category: '', actorEmail: '' }
const statusLabels: Record<ActivityItem['status'], string> = {
  completed: 'Completed', denied: 'Not permitted', failed: 'Could not complete', unknown: 'Outcome unconfirmed',
}
const statusStyles: Record<ActivityItem['status'], string> = {
  completed: 'bg-emerald-50 text-emerald-800', denied: 'bg-amber-50 text-amber-800',
  failed: 'bg-rose-50 text-rose-800', unknown: 'bg-slate-100 text-slate-700',
}

function queryFor(filters: Filters, cursor: string | null) {
  const query = new URLSearchParams({ limit: '25', scope: 'all' })
  if (filters.from) query.set('from_at', new Date(`${filters.from}T00:00:00`).toISOString())
  if (filters.to) query.set('to_at', new Date(`${filters.to}T23:59:59`).toISOString())
  if (filters.category) query.set('category', filters.category)
  if (filters.actorEmail) query.set('actor_email', filters.actorEmail)
  if (cursor) query.set('cursor', cursor)
  return `/access/activity/summary?${query}`
}

export function ActivityPage() {
  const [draft, setDraft] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [page, setPage] = useState<ActivityPageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actors, setActors] = useState<string[]>([])
  const pageIndex = cursors.length - 1

  useEffect(() => {
    let active = true
    apiRequest<string[]>('/access/activity/actors')
      .then((value) => { if (active) setActors(value) })
      .catch(() => { /* Activity remains usable if actor suggestions are unavailable. */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    apiRequest<ActivityPageResponse>(queryFor(filters, cursors[pageIndex]))
      .then((value) => { if (active) { setPage(value); setError(null) } })
      .catch((cause) => { if (active) { setPage(null); setError(cause instanceof Error ? cause.message : 'Could not load Activity') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, cursors, pageIndex])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draft.from && draft.to && draft.from > draft.to) { setError('Start date must be before end date.'); return }
    setLoading(true)
    setCursors([null])
    setFilters({ ...draft })
  }
  const copyReference = async (item: ActivityItem) => {
    if (!item.reference_id) return
    try { await navigator.clipboard.writeText(item.reference_id); setCopiedId(item.id) }
    catch { setError('Could not copy the reference ID.') }
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-hq-teal">FinOps Console</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">Activity</h1><p className="mt-1 text-sm text-slate-600">A history of who did what and when.</p></div>
    <form onSubmit={applyFilters} className="rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm text-slate-700">Operation<select aria-label="Operation" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All operations</option><option value="read">View</option><option value="create">Create</option><option value="update">Edit</option><option value="delete">Delete</option><option value="other">Other</option></select></label>
        <label className="min-w-52 flex-[2] text-sm text-slate-700">Who<select aria-label="Who" value={draft.actorEmail} onChange={(event) => setDraft({ ...draft, actorEmail: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All people</option>{actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}</select></label>
        <button type="submit" className="rounded-lg bg-hq-teal px-4 py-2 text-sm font-semibold text-white">Filter</button>
        <button type="button" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setCursors([null]); setLoading(true) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Clear</button>
      </div>
      <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer">More filters</summary><div className="mt-2 flex flex-wrap items-end gap-3">
        <label>From<input aria-label="From" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label>To<input aria-label="To" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label>
      </div></details>
    </form>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p role="status" className="text-sm text-slate-600">Loading Activity...</p> : !page?.items.length ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No Activity matches these filters.</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
      {page.items.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
        <time className="w-40 shrink-0 text-xs text-slate-500" dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString()}</time>
        <span className="w-64 max-w-full shrink-0 truncate text-sm font-semibold text-slate-900" title={item.actor}>{item.actor}</span>
        <span className="min-w-52 flex-1 text-sm text-slate-800">{item.action.charAt(0).toLowerCase() + item.action.slice(1)}{(item.key_name || item.environment) && <span className="ml-2 text-xs text-slate-500">{item.key_name ? `via ${item.key_name}` : ''}{item.key_name && item.environment ? ' · ' : ''}{item.environment ? item.environment === 'prod' ? 'Production' : 'Sandbox' : ''}</span>}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[item.status]}`}>{statusLabels[item.status]}</span>
        {item.reference_id && <button type="button" onClick={() => void copyReference(item)} title={`Support reference: ${item.reference_id}. Click to copy.`} aria-label={`Copy reference ID for ${item.action}`} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-hq-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><Info size={16} aria-hidden="true" /></button>}
        {copiedId === item.id && <span role="status" className="text-xs text-slate-500">Reference copied</span>}
      </article>)}
    </div>}
    <div className="flex items-center gap-3"><button type="button" disabled={pageIndex === 0 || loading} onClick={() => { setLoading(true); setCursors((current) => current.slice(0, -1)) }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Previous</button><span className="text-sm text-slate-600">Page {pageIndex + 1}</span><button type="button" disabled={!page?.next_cursor || loading} onClick={() => { if (page?.next_cursor) { setLoading(true); setCursors((current) => [...current, page.next_cursor]) } }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Next</button></div>
  </div>
}
