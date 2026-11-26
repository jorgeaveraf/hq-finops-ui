import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react'
import { FilterDropdown } from '../../components/FilterDropdown'
import { InfoTooltip } from '../../components/InfoTooltip'
import { ActivityDateFilter } from './ActivityDateFilter'
import { ActivityPersonFilter } from './ActivityPersonFilter'
import { apiRequest } from '../../api/finopsApi'
import { AuthContext } from '../auth/AuthContext'

type ActivityItem = {
  id: string
  occurred_at: string
  reference_id: string | null
  actor: string
  actor_name?: string | null
  key_name: string | null
  client_name: string | null
  target_name: string | null
  target_email?: string | null
  record_type?: string | null
  record_name?: string | null
  record_id?: string | null
  linked_payment_id?: string | null
  environment: string | null
  action: string
  category: 'read' | 'create' | 'update' | 'delete' | 'other'
  status: 'completed' | 'denied' | 'failed' | 'unknown'
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return <button type="button" aria-label={copied ? 'Copied' : label} onClick={() => void copy()} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">{copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}</button>
}
type ActivityPageResponse = { items: ActivityItem[]; next_cursor: string | null; total_count?: number | null }
type Filters = { from: string; to: string; actorEmail: string; category: string }
type Scope = 'qbo_transactions' | 'completed'
const emptyFilters: Filters = { from: '', to: '', actorEmail: '', category: '' }

const pageSize = 25

function describeAction(action: string) {
  const attempted = action.startsWith('Tried to ')
  const base = attempted ? action.slice(9) : action
  const role = /^Updated (.+): role set to (.+)$/i.exec(base)
  const access = /^Updated (.+): access set to (.+)$/i.exec(base)
  const entity = /^Updated (.+): status set to (.+)$/i.exec(base)
  const description = role ? `changed ${role[1]}'s role to ${role[2]}`
    : access ? `changed ${access[1]}'s access to ${access[2]}`
      : entity ? `changed ${entity[1]}'s status to ${entity[2]}`
        : base === 'Viewed entity list' ? 'viewed the entity list'
          : base.charAt(0).toLowerCase() + base.slice(1)
  return attempted ? `tried to ${description}` : description
}

function relatedTarget(item: ActivityItem, description: string) {
  const target = item.target_name || item.client_name
  if (!target || description.toLowerCase().includes(target.toLowerCase())) return null
  return target
}

function nameKnownPerson(description: string, item: ActivityItem, user: { name: string; email: string } | null | undefined) {
  const targetEmail = item.target_email || (item.target_name?.includes('@') ? item.target_name : null)
  const targetName = item.target_name
  if (!targetEmail || !targetName) return description
  const self = item.actor.toLowerCase() === targetEmail.toLowerCase()
  const display = targetEmail.toLowerCase() === user?.email?.toLowerCase() && user.name ? user.name : targetName
  const at = description.toLowerCase().indexOf(targetName.toLowerCase())
  if (at < 0) return description
  const before = description.slice(0, at)
  const after = description.slice(at + targetName.length)
  if (self && after.startsWith("'s")) return `${before}their own${after.slice(2)}`
  return `${before}${self ? 'themselves' : display}${after}`
}

function queryFor(filters: Filters, scope: Scope, pageNumber: number) {
  const query = new URLSearchParams({ limit: String(pageSize), scope, page: String(pageNumber) })
  if (filters.from) query.set('from_at', new Date(`${filters.from}T00:00:00`).toISOString())
  if (filters.to) query.set('to_at', new Date(`${filters.to}T23:59:59`).toISOString())
  if (filters.actorEmail) query.set('actor_email', filters.actorEmail)
  if (filters.category) query.set('category', filters.category)
  return `/access/activity/summary?${query}`
}

export function ActivityPage() {
  const user = useContext(AuthContext)?.user
  const paginationRef = useRef<HTMLElement>(null)
  const pageChangePendingRef = useRef(false)
  const [scope, setScope] = useState<Scope>('qbo_transactions')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [page, setPage] = useState<ActivityPageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actors, setActors] = useState<string[]>([])
  const totalCount = page?.total_count
  const lastPage = typeof totalCount === 'number' ? Math.max(1, Math.ceil(totalCount / pageSize)) : null

  useEffect(() => {
    let active = true
    apiRequest<string[]>('/access/activity/actors')
      .then((value) => { if (active) setActors(value) })
      .catch(() => { /* Activity remains usable if actor suggestions are unavailable. */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    apiRequest<ActivityPageResponse>(queryFor(filters, scope, pageNumber))
      .then((value) => { if (active) {
        const finalPage = typeof value.total_count === 'number' ? Math.max(1, Math.ceil(value.total_count / pageSize)) : null
        if (finalPage && pageNumber > finalPage) { setPageNumber(finalPage); setPageInput(String(finalPage)); return }
        setPage(value); setError(null)
      } })
      .catch((cause) => { if (active) { setPage(null); setError(cause instanceof Error ? cause.message : 'Could not load Activity') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, scope, pageNumber])

  useLayoutEffect(() => {
    if (!pageChangePendingRef.current || loading || error || !page) return
    pageChangePendingRef.current = false
    paginationRef.current?.scrollIntoView?.({ block: 'end', behavior: 'auto' })
  }, [page, loading, error])

  const applyFilters = (next: Filters) => {
    pageChangePendingRef.current = false
    setLoading(true)
    setPageNumber(1)
    setPageInput('1')
    setFilters(next)
  }

  const changeScope = (next: Scope) => {
    if (next === scope) return
    pageChangePendingRef.current = false
    setLoading(true)
    setPageNumber(1)
    setPageInput('1')
    setFilters(emptyFilters)
    setScope(next)
  }

  const selectCategory = (category: string) => {
    if (category === 'read' && scope === 'qbo_transactions') setScope('completed')
    applyFilters({ ...filters, category })
  }

  const changePage = (next: number) => {
    pageChangePendingRef.current = true
    setLoading(true)
    setPageNumber(next)
    setPageInput(String(next))
  }

  const goToPage = (value: string) => {
    if (!/^[1-9]\d*$/.test(value)) { setPageInput(String(pageNumber)); return }
    const requested = Number(value)
    if (!Number.isSafeInteger(requested) || lastPage === null || requested > lastPage) { setPageInput(String(pageNumber)); return }
    if (requested !== pageNumber) changePage(requested)
    else setPageInput(String(pageNumber))
  }

  return <div className="access-view activity-view mx-auto max-w-6xl space-y-5">
    <div className="flex items-center gap-1"><h1 className="text-2xl font-semibold text-slate-900">Activity</h1><InfoTooltip label="About Activity history" text="Showing the last 15 days. History is kept for 30 days." /></div>
    <section aria-label="Activity filters" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-slate-200 px-4" >
        <div className="flex gap-6" role="group" aria-label="Activity view">
          <button type="button" aria-pressed={scope === 'completed'} onClick={() => changeScope('completed')} className={`border-b-2 px-0.5 py-3 text-sm font-semibold ${scope === 'completed' ? 'border-hq-teal text-hq-teal' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>All activity</button>
          <button type="button" aria-pressed={scope === 'qbo_transactions'} onClick={() => changeScope('qbo_transactions')} className={`border-b-2 px-0.5 py-3 text-sm font-semibold ${scope === 'qbo_transactions' ? 'border-hq-teal text-hq-teal' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>QBO transactions</button>
        </div>
        <span aria-live="polite" className="py-2 text-xs tabular-nums text-slate-500">{loading ? 'Updating…' : error ? 'Activity unavailable' : typeof totalCount === 'number' ? `${totalCount} ${totalCount === 1 ? 'event' : 'events'}` : `${page?.items.length ?? 0} events on this page`}</span>
      </div>
      <div className="grid items-end gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActivityPersonFilter value={filters.actorEmail} actors={actors} onChange={(actorEmail) => applyFilters({...filters, actorEmail})} />
        <ActivityDateFilter from={filters.from} to={filters.to} onChange={(from,to) => applyFilters({...filters,from,to})} />
        <div><FilterDropdown label="Operation" placeholder="Any operation" value={filters.category} options={[{value:'',label:'Any operation'},{value:'read',label:'Read'},{value:'create',label:'Created'},{value:'update',label:'Updated'},{value:'delete',label:'Deleted'},{value:'other',label:'Other'}]} onChange={selectCategory} />{filters.category && <button type="button" onClick={() => selectCategory('')} className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-hq-teal hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><X aria-hidden="true" className="h-3 w-3" />Clear operation</button>}</div>
      </div>
      {(filters.actorEmail || filters.from || filters.category) && <div className="flex justify-end px-4 pb-3"><button type="button" onClick={() => applyFilters(emptyFilters)} className="rounded-lg px-2 py-1 text-xs font-medium text-hq-teal">Clear filters</button></div>}
    </section>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error} <button type="button" onClick={() => applyFilters({...filters})} className="ml-2 font-semibold underline">Try again</button></p>}
    {loading && !page ? <p role="status" className="text-sm text-slate-600">Loading activity…</p> : error ? null : !page?.items.length ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm"><p className="font-medium text-slate-900">No activity found</p><p className="mt-1 text-slate-600">{scope === 'qbo_transactions' ? 'No QBO transactions match these filters. Check All activity.' : 'Try another person, operation, or date range.'}</p></div> : <div aria-busy={loading} aria-label="Activity history" className="rounded-xl border border-slate-200 bg-white">
      <div className={loading ? 'opacity-60' : undefined}>{page.items.map((item, index) => {
        const date = new Date(item.occurred_at)
        const day = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const previousDay = index ? new Date(page.items[index - 1].occurred_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null
        const description = describeAction(item.action)
        const action = nameKnownPerson(description, item, user)
        const actor = item.actor_name || (user?.email?.toLowerCase() === item.actor.toLowerCase() && user.name ? user.name : item.actor)
        const target = relatedTarget(item, description)
        return <Fragment key={item.id}>
          {day !== previousDay && <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-600 first:rounded-t-xl">{day}</div>}
          <article className="border-b border-slate-100 px-5 py-3 last:border-b-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm leading-5 text-slate-900"><span className="font-semibold" title={item.actor}>{actor}</span> <span>{action}</span>.</p>
                {target && <p className="mt-0.5 text-xs text-slate-600">Related to {target}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <time className="tabular-nums" dateTime={item.occurred_at} aria-label={date.toLocaleString('en-US')}>{date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time>
                  {item.key_name && <><span aria-hidden="true">·</span><span>Using API key {item.key_name}</span></>}
                  {item.environment && <><span aria-hidden="true">·</span><span>{item.environment === 'prod' ? 'Production' : item.environment === 'sandbox' ? 'Sandbox' : item.environment}</span></>}
                </div>
              </div>
            </div>
            {(item.record_type || item.reference_id) && <details className="group mt-2 text-xs text-slate-600">
              <summary className="w-fit cursor-pointer list-none font-medium text-hq-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">Details <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span></summary>
              <dl className="mt-2 grid gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                {item.record_type && item.status !== 'completed' && <div><dt className="text-slate-500">Result</dt><dd className="font-medium text-slate-800">{item.status}</dd></div>}
                {item.record_type && <div><dt className="text-slate-500">QuickBooks record</dt><dd className="font-medium text-slate-800">{item.record_type}{item.record_name ? ` · ${item.record_name}` : ''}</dd></div>}
                {item.record_id && <div><dt className="text-slate-500">QuickBooks ID</dt><dd className="break-all font-medium text-slate-800">{item.record_id}</dd></div>}
                {item.linked_payment_id && <div><dt className="text-slate-500">Linked payment ID</dt><dd className="break-all font-medium text-slate-800">{item.linked_payment_id}</dd></div>}
                {item.client_name && <div><dt className="text-slate-500">Entity</dt><dd className="font-medium text-slate-800">{item.client_name}</dd></div>}
                {item.environment && <div><dt className="text-slate-500">Environment</dt><dd className="font-medium text-slate-800">{item.environment === 'prod' ? 'Production' : item.environment === 'sandbox' ? 'Sandbox' : item.environment}</dd></div>}
                {item.key_name && <div><dt className="text-slate-500">API key</dt><dd className="font-medium text-slate-800">{item.key_name}</dd></div>}
                {item.reference_id && <div className="sm:col-span-2"><dt className="text-slate-500">Support reference</dt><dd className="mt-1 flex items-center gap-2 break-all font-mono text-slate-800"><span>{item.reference_id}</span><CopyValue value={item.reference_id} label="Copy support reference" /></dd></div>}
              </dl>
            </details>}
          </article>
        </Fragment>
      })}</div>
    </div>}
    {!error && page && (lastPage === null || lastPage > 1) && <nav ref={paginationRef} aria-label="Activity pages" className="flex items-center justify-end gap-2 text-sm text-slate-600">
      <button type="button" aria-label="Previous page" disabled={pageNumber === 1 || loading} onClick={() => changePage(pageNumber - 1)} className="rounded-lg p-2 hover:bg-slate-200 disabled:opacity-30"><ChevronLeft size={18} /></button>
      <span>Page</span>
      <input aria-label="Go to page" type="text" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)} onBlur={() => goToPage(pageInput)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { setPageInput(String(pageNumber)); event.currentTarget.blur() } }} disabled={loading || lastPage === null} className="h-9 min-w-9 rounded-md border border-slate-300 bg-white px-1 text-center text-sm text-slate-900 focus:border-hq-teal focus:outline-none focus:ring-2 focus:ring-hq-teal/20 disabled:opacity-50" style={{ width: `${Math.max(2, String(lastPage ?? pageNumber).length) + 2}ch` }} />
      <span aria-live="polite">of {lastPage ?? '…'}</span>
      <button type="button" aria-label="Next page" disabled={loading || (lastPage !== null ? pageNumber >= lastPage : !page.next_cursor)} onClick={() => changePage(pageNumber + 1)} className="rounded-lg p-2 hover:bg-slate-200 disabled:opacity-30"><ChevronRight size={18} /></button>
    </nav>}
  </div>
}
