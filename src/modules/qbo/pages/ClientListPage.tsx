import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, RefreshCcw } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { FilterDropdown } from '../../../components/FilterDropdown'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { describeGatewayError, listClients } from '../api/qboGatewayClient'
import type { QboClient, QboConnectionState } from '../api/qboGatewayClient'
import { formatClientGroup, getClientId, getClientName, getClientRecordStatus } from '../utils'

const UNASSIGNED_FILTER = '__unassigned__'
type ConnectionFilter = 'all' | 'connected' | 'reconnect-needed' | 'unavailable'
type SortOrder = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc'
type CreatedFilter = 'all' | 'last-7-days' | 'last-month' | 'last-6-months' | 'last-year' | 'custom'
const nameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export type ClientListContext = {
  clients: QboClient[]
  isLoading: boolean
  error: string | null
  reloadClients: () => Promise<void>
}

function createdTime(entity: QboClient) {
  const time = Date.parse(entity.created_at || '')
  return Number.isFinite(time) ? time : null
}

function monthsAgo(months: number, now: Date) {
  const date = new Date(now)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() - months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return date.getTime()
}

function localDateISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && localDateISO(date) === value
}

function formatRangeLabel(from: string, to: string) {
  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', options).format(new Date(`${value}T00:00:00`))
  if (!from) return `Through ${format(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (!to) return `From ${format(from, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (from === to) return format(from, { month: 'short', day: 'numeric', year: 'numeric' })
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${format(from, { month: 'short', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`
  }
  return `${format(from, { month: 'short', day: 'numeric', year: 'numeric' })} – ${format(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function matchesCreatedDate(entity: QboClient, filter: CreatedFilter, from: string, to: string, now: Date) {
  if (filter === 'all' || (filter === 'custom' && !from && !to)) return true
  const created = createdTime(entity)
  if (created === null) return false
  const current = now.getTime()
  if (filter === 'last-7-days') return created >= current - 7 * 24 * 60 * 60 * 1000 && created <= current
  if (filter === 'last-month') return created >= monthsAgo(1, now) && created <= current
  if (filter === 'last-6-months') return created >= monthsAgo(6, now) && created <= current
  if (filter === 'last-year') return created >= monthsAgo(12, now) && created <= current
  const start = from ? new Date(`${from}T00:00:00`).getTime() : null
  const endDate = to ? new Date(`${to}T00:00:00`) : null
  endDate?.setDate(endDate.getDate() + 1)
  const end = endDate?.getTime() ?? null
  return created <= current && (start === null || created >= start) && (end === null || created < end)
}

function compareCreated(left: number | null, right: number | null, order: 'created-asc' | 'created-desc') {
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1
  return order === 'created-asc' ? left - right : right - left
}

function compareEntities(left: QboClient, right: QboClient, sort: SortOrder) {
  const primary = sort === 'created-asc' || sort === 'created-desc'
    ? compareCreated(createdTime(left), createdTime(right), sort)
    : nameCollator.compare(getClientName(left), getClientName(right)) * (sort === 'name-desc' ? -1 : 1)
  return primary || nameCollator.compare(getClientName(left), getClientName(right)) || left.id.localeCompare(right.id)
}

export function ClientListPage() {
  const [clients, setClients] = useState<QboClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [customRangeEditing, setCustomRangeEditing] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const customRangeRef = useRef<HTMLDivElement>(null)
  const customStartRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const connectionParam = searchParams.get('connection')
  const connectionFilter: ConnectionFilter = connectionParam === 'connected' || connectionParam === 'reconnect-needed' || connectionParam === 'unavailable' ? connectionParam : 'all'
  const today = localDateISO(new Date())
  const createdParam = searchParams.get('created')
  const requestedFrom = searchParams.get('from') || ''
  const requestedTo = searchParams.get('to') || ''
  const validCustomRange = isISODate(requestedFrom) && isISODate(requestedTo) && requestedFrom <= requestedTo && requestedFrom <= today
  const createdFrom = validCustomRange ? requestedFrom : ''
  const createdTo = validCustomRange ? (requestedTo > today ? today : requestedTo) : ''
  const createdFilter: CreatedFilter = createdParam === 'last-7-days' || createdParam === 'last-month' || createdParam === 'last-6-months' || createdParam === 'last-year' || (createdParam === 'custom' && validCustomRange) ? createdParam : 'all'
  const draftHasFutureDate = draftFrom > today || draftTo > today
  const draftRangeValid = isISODate(draftFrom) && isISODate(draftTo) && draftFrom <= draftTo && !draftHasFutureDate
  const sortParam = searchParams.get('sort')
  const sort: SortOrder = sortParam === 'name-desc' || sortParam === 'created-desc' || sortParam === 'created-asc' ? sortParam : 'name-asc'
  const createLinkRef = useRef<HTMLAnchorElement>(null)
  const location = useLocation()
  const successMessage = (location.state as { message?: string } | null)?.message ?? null
  const restoreCreateFocus = (location.state as { restoreCreateFocus?: boolean } | null)?.restoreCreateFocus ?? false

  useEffect(() => {
    if (createdParam !== 'custom' || (validCustomRange && requestedTo <= today)) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (validCustomRange) next.set('to', today)
      else { next.delete('created'); next.delete('from'); next.delete('to') }
      return next
    }, { replace: true })
  }, [createdParam, requestedFrom, requestedTo, validCustomRange, today, setSearchParams])

  const updateFilter = (key: 'connection' | 'created', value: string) => {
    if (key === 'created') setCustomRangeEditing(false)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'all') next.delete(key)
      else next.set(key, value)
      if (key === 'created') { next.delete('from'); next.delete('to') }
      return next
    })
  }

  const closeCustomRange = () => {
    setCustomRangeEditing(false)
    customRangeRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')?.focus()
  }

  useEffect(() => {
    if (!customRangeEditing) return
    customStartRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!customRangeRef.current?.contains(event.target as Node)) setCustomRangeEditing(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeCustomRange() }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [customRangeEditing])

  const reloadClients = useCallback(async () => {
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const entities = await listClients(undefined, true)
      if (currentRequest === requestId.current) setClients(entities)
    } catch (err) {
      if (currentRequest === requestId.current) setError(describeGatewayError(err, 'Unable to load entities.'))
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadClients()
    return () => { requestId.current += 1 }
  }, [reloadClients])

  useEffect(() => {
    if (successMessage) window.history.replaceState({ ...window.history.state, usr: null }, document.title)
  }, [successMessage])

  useEffect(() => {
    if (restoreCreateFocus) {
      createLinkRef.current?.focus()
      window.history.replaceState({ ...window.history.state, usr: null }, document.title)
    }
  }, [restoreCreateFocus])

  const clientGroups = [...new Set(clients.map((entity) => entity.client_group).filter((group): group is string => Boolean(group)))].sort()
  const hasUnassigned = clients.some((entity) => !entity.client_group)
  const searchTerm = search.trim().toLocaleLowerCase()
  const dateFilterActive = createdFilter !== 'all' && (createdFilter !== 'custom' || Boolean(createdFrom || createdTo))
  const filtersActive = dateFilterActive || connectionFilter !== 'all' || Boolean(searchTerm)
  const additionalFilterCount = Number(dateFilterActive) + Number(connectionFilter !== 'all')
  useEffect(() => {
    if (additionalFilterCount > 0) setMoreFiltersOpen(true)
  }, [additionalFilterCount])
  const now = new Date()
  const visibleEntities = clients.filter((entity) => {
    const connection = entity.connection_state ?? 'unavailable'
    const matchesConnection = connectionFilter === 'all' || (getClientRecordStatus(entity) === 'active' && connection === connectionFilter)
    const matchesSearch = !searchTerm || getClientName(entity).toLocaleLowerCase().includes(searchTerm)
      || formatClientGroup(entity.client_group).toLocaleLowerCase().includes(searchTerm)
      || (entity.client_group || '').includes(searchTerm)
    return matchesConnection && matchesSearch && matchesCreatedDate(entity, createdFilter, createdFrom, createdTo, now)
  })
  const entityCountText = filtersActive
    ? `${visibleEntities.length} of ${clients.length} entities`
    : clients.length === 1 ? '1 entity' : `${clients.length} entities`
  const groups = clientGroups.map((group) => ({
    key: group,
    label: formatClientGroup(group),
    entities: visibleEntities.filter((entity) => entity.client_group === group).sort((left, right) => compareEntities(left, right, sort)),
  }))
  if (hasUnassigned) {
    groups.push({
      key: UNASSIGNED_FILTER,
      label: 'No client assigned',
      entities: visibleEntities.filter((entity) => !entity.client_group).sort((left, right) => compareEntities(left, right, sort)),
    })
  }
  const visibleGroups = groups.filter((group) => group.entities.length > 0).sort((left, right) => {
    if (left.key === UNASSIGNED_FILTER) return 1
    if (right.key === UNASSIGNED_FILTER) return -1
    const leftDate = createdTime(left.entities[0])
    const rightDate = createdTime(right.entities[0])
    const primary = sort === 'created-asc' || sort === 'created-desc' ? compareCreated(leftDate, rightDate, sort)
      : nameCollator.compare(left.label, right.label) * (sort === 'name-desc' ? -1 : 1)
    return primary || nameCollator.compare(left.label, right.label)
  })
  const defaultExpanded = clientGroups.length + Number(hasUnassigned) <= 5 || Boolean(searchTerm)
  const isExpanded = (groupKey: string) => expandedGroups[groupKey] ?? defaultExpanded
  const allExpanded = visibleGroups.every((group) => isExpanded(group.key))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Clients & Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">QuickBooks Online entities</h1>
        </div>
        <Button asChild icon={<Plus className="h-4 w-4" />}>
          <Link ref={createLinkRef} to="/qbo/clients/new">Create entity</Link>
        </Button>
      </div>

      <Card
        title="Entities"
        titleSuffix={<InfoTooltip label="About this entity list" text="Search entities and clients, or filter by creation date and QuickBooks connection." />}
        actions={<span className="self-start rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{entityCountText}</span>}
      >
        {error && <div className="space-y-2"><Alert title="Unable to load entities" description={error} variant="error" /><Button type="button" variant="secondary" size="sm" onClick={() => void reloadClients()}>Try again</Button></div>}
        {successMessage && <Alert title={successMessage} variant="success" />}

        {isLoading ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600" role="status">
            <RefreshCcw className="h-4 w-4 animate-spin text-hq-teal" />
            Loading entities...
          </div>
        ) : error && clients.length === 0 ? null : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 md:flex-row">
            <div>
              <p className="font-semibold text-slate-900">No entities found</p>
              <p>Create an entity under a client to start the QuickBooks connection flow.</p>
            </div>
            <Button asChild size="sm" icon={<Plus className="h-4 w-4" />}>
              <Link to="/qbo/clients/new">Create entity</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-80">
                <label htmlFor="entity-search" className="label mb-1.5 block">Search</label>
                <input id="entity-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Entity or client" className="input-base min-h-11 w-full hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-hq-teal/30" />
              </div>
              {filtersActive && (
                <button type="button" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-hq-teal hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal" onClick={() => { setSearch(''); setCustomRangeEditing(false); setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('client'); next.delete('connection'); next.delete('created'); next.delete('from'); next.delete('to'); return next }) }}>
                  Clear filters
                </button>
              )}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <button type="button" aria-expanded={moreFiltersOpen} aria-controls="entity-more-filters" onClick={() => setMoreFiltersOpen((open) => !open)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-semibold text-slate-700 hover:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal">
                  <ChevronDown className={`h-4 w-4 transition-transform ${moreFiltersOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
                  More filters
                  {additionalFilterCount > 0 && <span className="rounded-full bg-hq-teal/10 px-2 py-0.5 text-xs text-hq-teal">{additionalFilterCount} active</span>}
                </button>
                {moreFiltersOpen && <div id="entity-more-filters" className="mt-3 grid gap-3 sm:grid-cols-2">
              <div ref={customRangeRef} className="relative w-full">
                <FilterDropdown
                  label="Created"
                  placeholder="Select range"
                  value={customRangeEditing ? 'custom' : createdFilter}
                  selectedLabelOverride={customRangeEditing ? 'Custom range' : createdFilter === 'custom' ? formatRangeLabel(createdFrom, createdTo) : undefined}
                  onChange={(value) => {
                    if (value === 'custom') {
                      setDraftFrom(createdFrom)
                      setDraftTo(createdTo)
                      setCustomRangeEditing(true)
                    } else updateFilter('created', value)
                  }}
                  options={[
                    { value: 'last-7-days', label: 'Last 7 days' },
                    { value: 'last-month', label: 'Last month' },
                    { value: 'last-6-months', label: 'Last 6 months' },
                    { value: 'last-year', label: 'Last year' },
                  ]}
                  footerOption={{ value: 'custom', label: 'Custom range' }}
                />
                {customRangeEditing && <div role="group" aria-label="Custom date range" className="absolute left-0 top-full z-30 mt-2 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/15">
                  <p className="mb-3 text-sm font-semibold text-slate-900">Custom date range</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label htmlFor="created-from" className="label mb-1.5 block">From</label><input ref={customStartRef} id="created-from" type="date" value={draftFrom} max={draftTo && draftTo < today ? draftTo : today} onChange={(event) => setDraftFrom(event.target.value)} className="input-base min-h-11 w-full" /></div>
                    <div><label htmlFor="created-to" className="label mb-1.5 block">To</label><input id="created-to" type="date" value={draftTo} min={draftFrom || undefined} max={today} onChange={(event) => setDraftTo(event.target.value)} className="input-base min-h-11 w-full" /></div>
                  </div>
                  {draftHasFutureDate && <p role="alert" className="mt-2 text-sm text-red-700">Dates cannot be in the future.</p>}
                  <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={closeCustomRange} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal">Cancel</button>
                    <button type="button" disabled={!draftRangeValid} onClick={() => { if (!draftRangeValid) return; setSearchParams((current) => { const next = new URLSearchParams(current); next.set('created', 'custom'); next.set('from', draftFrom); next.set('to', draftTo); return next }); closeCustomRange() }} className="rounded-lg bg-hq-teal px-3 py-2 text-sm font-semibold text-white hover:bg-hq-tealDark focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:opacity-50">Apply range</button>
                  </div>
                </div>}
              </div>
              <div className="w-full">
                <FilterDropdown
                  label="QuickBooks connection"
                  placeholder="All connection states"
                  value={connectionFilter}
                  onChange={(value) => updateFilter('connection', value)}
                  options={[
                    { value: 'connected', label: 'Connected' },
                    { value: 'reconnect-needed', label: 'Reconnect needed' },
                    { value: 'unavailable', label: 'Unavailable' },
                  ]}
                />
              </div>
                </div>}
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 sm:justify-end sm:gap-5">
              <div className="min-w-0 max-w-52 flex-1 sm:flex-none sm:w-52">
                <FilterDropdown
                  label="Sort by"
                  placeholder="Client name A–Z"
                  value={sort}
                  onChange={(value) => {
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current)
                      if (value === 'name-asc') next.delete('sort')
                      else next.set('sort', value)
                      return next
                    })
                  }}
                  options={[
                    { value: 'name-asc', label: 'Client name A–Z' },
                    { value: 'name-desc', label: 'Client name Z–A' },
                    { value: 'created-desc', label: 'Newest created' },
                    { value: 'created-asc', label: 'Oldest created' },
                  ]}
                />
              </div>
              {visibleGroups.length > 1 && <button type="button" onClick={() => setExpandedGroups(Object.fromEntries(visibleGroups.map((group) => [group.key, !allExpanded])))} className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-hq-teal hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hq-teal">{allExpanded ? 'Collapse all' : 'Expand all'}</button>}
            </div>
            {visibleEntities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No entities match these filters.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200" aria-label="Entities by client">
                {visibleGroups.map((group) => (
                  <li key={group.key}>
                    <ClientGroup
                      group={group}
                      collapsed={!isExpanded(group.key)}
                      onToggle={() => setExpandedGroups((current) => ({ ...current, [group.key]: !(current[group.key] ?? defaultExpanded) }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
      <Outlet context={{ clients, isLoading, error, reloadClients } satisfies ClientListContext} />
    </div>
  )
}

function ClientGroup({ group, collapsed, onToggle }: {
  group: { key: string; label: string; entities: QboClient[] }
  collapsed: boolean
  onToggle: () => void
}) {
  const panelId = `client-group-${encodeURIComponent(group.key)}`
  const count = group.entities.length

  return (
    <section aria-label={group.label}>
      <h3>
        <button
          type="button"
          aria-label={`${group.label}, ${count} ${count === 1 ? 'entity' : 'entities'}`}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          onClick={onToggle}
          className="group flex min-h-14 w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-hq-teal"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${group.key === UNASSIGNED_FILTER ? 'text-slate-600' : 'text-slate-900 group-hover:text-hq-teal'}`}>{group.label}</span>
          <span className="shrink-0 text-xs font-medium text-slate-500">{count} {count === 1 ? 'entity' : 'entities'}</span>
        </button>
      </h3>
      <ul id={panelId} hidden={collapsed} className="divide-y divide-slate-100 border-t border-slate-200" aria-label={`${group.label} entities`}>
        {group.entities.map((entity) => (
          <EntityRow key={getClientId(entity)} entity={entity} />
        ))}
      </ul>
    </section>
  )
}

function EntityRow({ entity }: { entity: QboClient }) {
  const entityId = getClientId(entity)
  const recordStatus = getClientRecordStatus(entity)
  const kind: QboConnectionState = entity.connection_state ?? 'unavailable'
  const status = recordStatus === 'inactive' ? { label: 'Monitoring paused', tone: 'neutral' }
    : kind === 'connected' ? { label: 'Connected', tone: 'success' }
    : kind === 'reconnect-needed' ? { label: 'Reconnect needed', tone: 'warning' }
      : { label: 'Unavailable', tone: 'neutral' }

  return (
    <li>
      <Link
        to={`/qbo/clients/${entityId}`}
        aria-label={getClientName(entity)}
        className="group grid min-h-14 grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 pl-11 transition-colors hover:bg-hq-teal/5 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-hq-teal sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center"
      >
        <div className="min-w-0">
          <span className="font-semibold text-slate-900 group-hover:text-hq-teal">{getClientName(entity)}</span>
          {entity.source === 'demo' && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Demo data</span>}
          {createdTime(entity) !== null && <p className="mt-1 text-xs text-slate-500">Created {new Date(entity.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
          {recordStatus !== 'active' && (
            <p className="mt-1 text-xs font-medium text-slate-600">
              {recordStatus === 'inactive' ? 'Inactive entity' : `Entity record: ${recordStatus}`}
            </p>
          )}
        </div>
        <div className="min-w-0 justify-self-start">
          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : status.tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
              <span className={`h-2 w-2 rounded-full ${status.tone === 'success' ? 'bg-emerald-500' : status.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} />
              {status.label}
          </span>
        </div>
      </Link>
    </li>
  )
}
