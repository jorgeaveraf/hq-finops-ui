import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClients, type QboClient } from '../qbo/api/qboGatewayClient'
import { InfoTooltip } from '../../components/InfoTooltip'
import { permissionName } from './accessLabels'
import { useAuth } from './useAuth'
import { AccountNavigation } from './AccountNavigation'
import { SuperadminAccessSummary } from './SuperadminAccessSummary'
import { ArrowUpRight, Building2, ChevronDown, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useTheme } from '../../theme'

const administrative = new Set(['access.manage', 'keys.admin', 'activity.read', 'entities.manage'])
const administrationDestinations: Record<string, string> = { 'access.manage': '/access/users', 'activity.read': '/access/activity', 'entities.manage': '/qbo/clients' }
const compactPermission = (value: string) => ({ 'View entity in FinOps': 'Entity details only', 'Read QuickBooks data for entity': 'Read', 'Edit QuickBooks data for entity': 'Edit', 'Delete QuickBooks data for entity': 'Delete', 'Manage entities in FinOps': 'Manage entities' } as Record<string, string>)[value] ?? value
const permissionOrder = ['Read', 'Edit', 'Delete']

export function AccessHomePage() {
  const { theme, changeTheme } = useTheme()
  const { user, access } = useAuth()
  const grants = access?.effective_grants ?? []
  const redundantView = (clientId: string | null) => grants.some((grant) => grant.operation === 'qbo.entity.read' && (grant.client_id === null || grant.client_id === clientId))
  const canReadClients = grants.some((grant) => ['client.read', 'qbo.entity.read'].includes(grant.operation))
  const clientAccessKey = `${access?.user.id ?? ''}|${grants.filter((grant) => ['client.read', 'qbo.entity.read'].includes(grant.operation)).map((grant) => `${grant.operation}:${grant.client_id ?? 'all'}`).sort().join(',')}`
  const [clientResult, setClientResult] = useState<{ key: string; clients: QboClient[]; error: boolean } | null>(null)
  const [coverageSearch, setCoverageSearch] = useState('')
  const [coverageOpen, setCoverageOpen] = useState(false)
  const clients = canReadClients && clientResult?.key === clientAccessKey ? clientResult.clients : []
  const clientsStatus = !canReadClients ? 'idle' : clientResult?.key !== clientAccessKey ? 'loading' : clientResult.error ? 'error' : 'ready'
  useEffect(() => {
    let active = true
    if (canReadClients) {
      void listClients().then((items) => { if (active) setClientResult({ key: clientAccessKey, clients: items, error: false }) })
        .catch(() => { if (active) setClientResult({ key: clientAccessKey, clients: [], error: true }) })
    }
    return () => { active = false }
  }, [canReadClients, clientAccessKey])

  const globalEntityPermissions = [...new Set(grants.filter((grant) => !grant.client_id && !administrative.has(grant.operation) && grant.operation !== 'connection.connect' && !(grant.operation === 'client.read' && redundantView(null))).map((grant) => `${compactPermission(permissionName(grant.operation))}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Production' : 'Sandbox'}` : ''}`))].sort((a, b) => permissionOrder.indexOf(a) - permissionOrder.indexOf(b))
  const administrationPermissions: { operation: string; label: string; to: string }[] = []
  const entityGroups = new Map<string, { name: string; permissions: string[] }>()
  const hasGlobalRead = grants.some((grant) => ['client.read', 'qbo.entity.read'].includes(grant.operation) && !grant.client_id)
  for (const grant of grants) {
    const permission = `${compactPermission(permissionName(grant.operation))}${grant.environment ? ` · ${grant.environment === 'prod' ? 'Production' : 'Sandbox'}` : ''}`
    if (grant.operation === 'keys.admin') {
      continue
    } else if (administrative.has(grant.operation)) {
      if (!administrationPermissions.some((item) => item.operation === grant.operation)) administrationPermissions.push({ operation: grant.operation, label: permission, to: administrationDestinations[grant.operation] })
    } else if (grant.operation === 'connection.connect' || grant.operation === 'client.read' && redundantView(grant.client_id)) {
      continue
    } else if (grant.client_id) {
      const name = clients.find((client) => client.id === grant.client_id)?.name ?? 'Assigned entity (name unavailable)'
      const current = entityGroups.get(grant.client_id) ?? { name, permissions: [] }
      if (!globalEntityPermissions.includes(permission) && !current.permissions.includes(permission)) current.permissions.push(permission)
      entityGroups.set(grant.client_id, current)
    }
  }
  const entities = [...entityGroups].filter(([, group]) => group.permissions.length > 0).sort((a, b) => a[1].name.localeCompare(b[1].name))
  const extraActions = new Map<string, string[]>()
  for (const [, group] of entities) for (const permission of group.permissions) extraActions.set(permission, [...(extraActions.get(permission) ?? []), group.name])
  const coveredClients = [...clients].sort((a, b) => a.name.localeCompare(b.name))
  const visibleClients = coveredClients.filter((client) => client.name.toLocaleLowerCase().includes(coverageSearch.trim().toLocaleLowerCase()))
  const effectivePermissions = (clientId: string) => [...new Set([...globalEntityPermissions, ...(entityGroups.get(clientId)?.permissions ?? [])])]
    .sort((a, b) => permissionOrder.indexOf(a) - permissionOrder.indexOf(b))

  return <div className="access-view mx-auto max-w-5xl">
    <AccountNavigation />
    <h1 className="sr-only">Account access</h1>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
      <div className="min-w-0">
        {user?.name && user.name !== user.email && <p className="text-lg font-semibold tracking-tight text-slate-950">{user.name}</p>}
        <p className="mt-0.5 break-words text-sm text-slate-600">{user?.email ?? user?.name}</p>
      </div>
      <div className="flex items-center gap-2"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</span><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-hq-teal">{access?.user.role}</span><InfoTooltip label="About your role" align="right" text="Your role sets the actions available; the permissions below show where they apply." /></div>
    </div>
    <section aria-labelledby="access-scope-title" className="mt-7">
      <div className="mb-4 flex items-baseline justify-between gap-3"><h2 id="access-scope-title" className="text-xl font-semibold tracking-tight text-slate-950">Access overview</h2></div>
      {access?.user.is_super_admin ? <SuperadminAccessSummary founder={access.user.is_super_admin_founder} ariaLabel="Your superadmin access" /> : globalEntityPermissions.length > 0 || entities.length > 0 || administrationPermissions.length > 0 ? <div className={`grid gap-4 ${coverageOpen ? 'items-start' : 'items-stretch'} ${globalEntityPermissions.length > 0 || entities.length > 0 ? administrationPermissions.length > 0 ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]' : '' : 'lg:max-w-md'}`}>
        {(globalEntityPermissions.length > 0 || entities.length > 0) && <section aria-label="Entity access" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Building2 aria-hidden="true" className="h-4 w-4 text-hq-teal" /><h3>Entity access</h3></div>
            {globalEntityPermissions.length > 0 ? <><p className="mt-4 text-xl font-semibold tracking-tight text-slate-950">All entities</p><p className="mt-1 text-sm text-slate-600">Current and future entities</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-md bg-teal-50 px-2.5 py-1 text-sm font-semibold text-hq-teal">{globalEntityPermissions.join(' · ')}</span><span className="text-sm text-slate-600">everywhere</span></div></> : <><p className="mt-4 text-xl font-semibold tracking-tight text-slate-950">Selected entities</p><p className="mt-1 text-sm text-slate-600">Access is limited to the entities listed below</p></>}
          </div>
          {entities.length > 0 && <div className="px-6 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{globalEntityPermissions.length > 0 ? 'Extra access on selected entities' : 'Assigned entities'}</p>{globalEntityPermissions.length > 0 ? <div className="mt-3 space-y-3">{[...extraActions].map(([permission, names]) => <div key={permission} className="text-sm"><p className="font-semibold text-slate-900">{permission} <span className="font-normal text-slate-600">· {names.length} {names.length === 1 ? 'entity' : 'entities'}</span></p><p className="mt-1 text-slate-600">{names.join(' · ')}</p></div>)}</div> : <div className="mt-2 divide-y divide-slate-100">{entities.map(([id, group]) => <div key={id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span className="text-sm font-medium text-slate-900">{group.name}</span><PermissionTags permissions={group.permissions} /></div>)}</div>}</div>}
          {hasGlobalRead && <details className="group border-t border-slate-100" onToggle={(event) => setCoverageOpen(event.currentTarget.open)}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-hq-teal hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><span>Entities and effective access</span><span className="flex items-center gap-2 text-xs font-medium text-slate-600">{clientsStatus === 'ready' ? `${clients.length} current` : clientsStatus === 'error' ? 'Could not load entities' : 'Loading entities…'}<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></span></summary>{clientsStatus === 'ready' && <div className="border-t border-slate-100 px-6 pb-5 pt-4"><label className="sr-only" htmlFor="covered-entity-search">Filter entities</label><input id="covered-entity-search" type="search" value={coverageSearch} onChange={(event) => setCoverageSearch(event.target.value)} placeholder="Filter entities by name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-hq-teal focus:outline-none" /><ul aria-label="Effective entity access" className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">{visibleClients.map((client) => <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span className="font-medium text-slate-900">{client.name}</span><span className="flex flex-wrap gap-1.5">{effectivePermissions(client.id).map((permission) => <span key={permission} className={`rounded-md px-2 py-0.5 text-xs font-medium ${permission === 'Edit' ? 'bg-teal-50 text-hq-teal' : 'bg-slate-100 text-slate-700'}`}>{permission}</span>)}</span></li>)}</ul>{visibleClients.length === 0 && <p className="py-3 text-sm text-slate-500">No matching entities</p>}</div>}</details>}
        </section>}
        <div className="flex min-w-0 flex-col">
          {administrationPermissions.length > 0 && <section aria-label="Administration access" className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-hq-teal" /><h3>Admin access</h3></div><ul className="mt-3 divide-y divide-slate-100">{administrationPermissions.map(({ operation, label, to }) => <li key={operation}><Link to={to} className="group flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 hover:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><span>{label}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-hq-teal opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" /></Link></li>)}</ul></section>}
        </div>
      </div> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No access assigned yet. Ask an administrator to choose your entities and permissions.</p>}
    </section>
    <section aria-labelledby="appearance-title" className="mt-10 border-t border-slate-200 pt-6">
      <h2 id="appearance-title" className="text-base font-semibold text-slate-950">Preferences</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div><p className="text-sm font-semibold text-slate-900">Appearance</p><p className="mt-0.5 text-sm text-slate-600">Choose how FinOps looks on this device.</p></div>
        <button type="button" onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
          {theme === 'dark' ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </section>
  </div>
}

function PermissionTags({ permissions }: { permissions: string[] }) {
  return <p className="text-sm font-medium text-slate-600">{permissions.join(' · ')}</p>
}
