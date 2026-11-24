import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Card } from '../../../components/Card'
import { ConfirmDangerModal } from '../../../components/ConfirmDangerModal'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { deleteClient, describeGatewayError, getClient, updateClientStatus } from '../api/qboGatewayClient'
import type { QboClient } from '../api/qboGatewayClient'
import { formatCheckedAt, formatClientGroup, getClientEnvironments, getClientId, getClientName, getClientRecordStatus, getConnectionStatus } from '../utils'
import { ReconnectButton } from '../components/ReconnectButton'
import { EntityAccessSummary, EntityIntegrations } from '../components/EntityAccessAndIntegrations'

export function ClientDetailPage({ readOnly = false, canUpdate = true, canDelete = true, canManageConnection = true, permittedConnectionEnvironments }: { readOnly?: boolean; canUpdate?: boolean; canDelete?: boolean; canManageConnection?: boolean; permittedConnectionEnvironments?: readonly string[] }) {
  canUpdate = canUpdate && !readOnly
  canDelete = canDelete && !readOnly
  canManageConnection = canManageConnection && !readOnly
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnState = location.state as { returnTo?: string; restoreList?: { search: string; expandedGroups: Record<string, boolean> } } | null
  const returnTo = returnState?.returnTo === '/qbo/clients' || returnState?.returnTo?.startsWith('/qbo/clients?') ? returnState.returnTo : '/qbo/clients'
  const [client, setClient] = useState<QboClient | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusActionRef = useRef<HTMLButtonElement>(null)
  const authorizationStartedAt = useRef<number | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!clientId) return
      setIsLoading(true)
      setError(null)
      try {
        const data = await getClient(clientId)
        setClient(data)
      } catch (err) {
        setError(describeGatewayError(err, 'Unable to load client.'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let mounted = true
    const reloadOnReturn = () => {
      const startedAt = authorizationStartedAt.current
      if (!startedAt || document.visibilityState !== 'visible' || Date.now() - startedAt < 1000) return
      authorizationStartedAt.current = null
      setIsRefreshing(true)
      getClient(clientId)
        .then((data) => { if (mounted) { setClient(data); setRefreshVersion((version) => version + 1); setRefreshMessage('Saved status reloaded.') } })
        .catch((err) => { if (mounted) setError(describeGatewayError(err, 'Unable to reload saved status.')) })
        .finally(() => { if (mounted) setIsRefreshing(false) })
    }
    window.addEventListener('focus', reloadOnReturn)
    document.addEventListener('visibilitychange', reloadOnReturn)
    return () => {
      mounted = false
      window.removeEventListener('focus', reloadOnReturn)
      document.removeEventListener('visibilitychange', reloadOnReturn)
    }
  }, [clientId])

  const environmentOptions = client ? getClientEnvironments(client) : []
  const connectableEnvironments = permittedConnectionEnvironments
    ? environmentOptions.filter((environment) => permittedConnectionEnvironments.includes(environment))
    : environmentOptions
  const clientIdentifier = client ? getClientId(client) : ''
  const recordStatus = client ? getClientRecordStatus(client) : 'unknown'
  const recordStatusLabel = recordStatus === 'active' ? 'Active entity' : recordStatus === 'inactive' ? 'Inactive entity' : 'Entity status unavailable'
  useEffect(() => {
    if (statusMessage) statusActionRef.current?.focus()
  }, [statusMessage])
  const connectionRows = environmentOptions.map((environment) => {
    const credential = client?.connections?.find((entry) => entry.environment === environment)
    return { environment, credential, status: getConnectionStatus(credential) }
  })
  const isInitialConnection = client?.connections?.length === 0

  const handleDelete = async () => {
    if (!clientId) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      await deleteClient(clientId)
      navigate('/qbo/clients', { state: { message: 'Entity deleted' } })
    } catch (err) {
      setDeleteError(describeGatewayError(err, 'Unable to delete client right now.'))
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleStatusChange = async (status: 'active' | 'inactive') => {
    if (!clientId || isChangingStatus) return
    setStatusError(null)
    setStatusMessage(null)
    setIsChangingStatus(true)
    try {
      const updated = await updateClientStatus(clientId, status)
      setClient((current) => current ? { ...current, status: updated.status } : current)
      setStatusMessage(status === 'inactive' ? 'Entity deactivated. Future connection checks and notifications are paused.' : 'Entity activated. It will be checked on the next run.')
    } catch (err) {
      setStatusError(describeGatewayError(err, 'Unable to change entity status right now.'))
    } finally {
      setIsChangingStatus(false)
      setShowDeactivateModal(false)
    }
  }

  const handleRefresh = async () => {
    if (!clientId || isRefreshing) return
    setIsRefreshing(true)
    setRefreshMessage(null)
    setError(null)
    try {
      setClient(await getClient(clientId))
      setRefreshVersion((version) => version + 1)
      setRefreshMessage('Saved status reloaded.')
    } catch (err) {
      setError(describeGatewayError(err, 'Unable to reload saved status.'))
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 pb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav aria-label="Entity breadcrumb"><Link to={returnTo} state={returnState?.restoreList ? { restoreList: returnState.restoreList } : undefined} className="inline-flex items-center gap-1.5 rounded text-xs font-semibold uppercase text-hq-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Clients & Integrations</Link></nav>
          <div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-bold text-slate-900 md:text-3xl">{client ? getClientName(client) : 'Entity'}</h1>{client?.source === 'demo' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Demo data</span>}</div>
        </div>
      </div>
      {client && <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
        <div><p className="text-xs font-medium text-slate-500">Client</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatClientGroup(client.client_group)}</p></div>
        <div><p className="text-xs font-medium text-slate-500">Entity status</p><p className={`mt-1 inline-flex items-center gap-1.5 text-sm font-semibold ${recordStatus === 'active' ? 'text-emerald-700' : 'text-slate-700'}`}><span className={`h-2 w-2 rounded-full ${recordStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />{recordStatusLabel}</p></div>
        {client.source === 'demo'
          ? <div><p className="text-xs font-medium text-slate-500">Access</p><p className="mt-1 text-sm font-semibold text-slate-700">Demo preview · read-only</p></div>
          : <EntityAccessSummary clientId={clientIdentifier} />}
      </div>}
      </header>

      {error && <Alert title="Error" description={error} variant="error" />}
      {deleteError && <Alert title="Delete failed" description={deleteError} variant="error" />}
      {statusError && <Alert title="Status change failed" description={statusError} variant="error" />}
      {statusMessage && <p role="status" className="text-sm text-emerald-700">{statusMessage}</p>}

      {isLoading ? (
        <Card>
          <p className="text-sm text-slate-600">Loading entity...</p>
        </Card>
      ) : client ? (
        <>

          <Card
            title="QuickBooks connection"
            titleSuffix={<InfoTooltip label="About QuickBooks connection" text="QuickBooks connection status and authorization options for this entity." />}
            actions={client.source !== 'demo' ? <button type="button" onClick={handleRefresh} disabled={isRefreshing} aria-label={isRefreshing ? 'Reloading saved status' : 'Reload saved status'} className="icon-first-action shrink-0 rounded-lg border border-transparent px-2.5 text-sm font-medium text-hq-teal hover:border-hq-teal/20 hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /><span className="icon-first-label">{isRefreshing ? 'Reloading…' : 'Reload saved status'}</span></button> : undefined}
          >
            {recordStatus === 'inactive' && <p className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">This entity is inactive. Connection details below are the last saved values; QuickBooks access, checks, and notifications are paused until it is activated.</p>}
            {refreshMessage && <p className="mb-3 text-xs text-slate-600" role="status">{refreshMessage}</p>}
            <div className="divide-y divide-slate-100 border-y border-slate-100">
              {connectionRows.length === 0 ? (
                <div className="py-3 text-sm text-slate-600">
                  No QuickBooks connection has been configured for this entity.
                </div>
              ) : connectionRows.map(({ environment, credential, status }) => (
                <div key={environment} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="min-w-20 font-medium text-slate-900">{environment === 'prod' ? 'Production' : 'Sandbox'}</span>
                    <span className={`inline-flex items-center gap-1.5 font-medium ${status.tone === 'success' ? 'text-emerald-700' : status.tone === 'warning' ? 'text-amber-800' : 'text-slate-600'}`}><span className={`h-2 w-2 rounded-full ${status.tone === 'success' ? 'bg-emerald-500' : status.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} aria-hidden="true" />{status.label}</span>
                  </div>
                  <p className="text-xs text-slate-500">{credential ? `Last checked: ${formatCheckedAt(credential.connection_checked_at)}` : 'Not connected yet'}</p>
                </div>
              ))}
            </div>
            {canManageConnection && client.source !== 'demo' && recordStatus === 'active' && connectableEnvironments.length > 0 && (
              <details className="mt-5 rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-hq-teal/5 hover:text-hq-teal focus-visible:bg-hq-teal/5 focus-visible:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">{isInitialConnection ? 'Connect QuickBooks' : 'Reconnect QuickBooks'}</summary>
                <div className="border-t border-slate-200 px-4 py-4">
                  <p className="mb-3 text-sm text-slate-600">{isInitialConnection ? 'Authorize this entity in QuickBooks to establish its first connection.' : 'Start a new QuickBooks authorization only if this connection needs repair.'}</p>
                  <ReconnectButton
                    key={`${clientIdentifier}-${refreshVersion}`}
                    clientId={clientIdentifier}
                    environments={connectableEnvironments}
                    mode={isInitialConnection ? 'connect' : 'reconnect'}
                    className="max-w-lg"
                    onAuthorizationStarted={() => { authorizationStartedAt.current = Date.now(); setRefreshMessage(null) }}
                  />
                </div>
              </details>
            )}
          </Card>

          {client.source !== 'demo' && <EntityIntegrations key={clientIdentifier} clientId={clientIdentifier} />}

          <details className="group rounded-2xl bg-white shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
              <span>
                <span className="block text-lg font-semibold text-slate-900">Technical details</span>
                <span className="mt-1 block text-sm text-slate-600">Identifiers and raw data</span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-slate-100 px-6 py-5">
              <div><p className="text-[11px] font-semibold uppercase text-slate-500">Entity ID</p><code className="mt-1 block break-all text-sm text-slate-900">{clientIdentifier}</code></div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-500">Realm ID</p>
                {connectionRows.length > 1 ? connectionRows.map(({ environment, credential }) => <p key={environment} className="mt-1 break-all text-sm text-slate-900"><span className="font-medium text-slate-600">{environment}:</span> {credential?.realm_id || '—'}</p>) : <code className="mt-1 block break-all text-sm text-slate-900">{connectionRows[0]?.credential?.realm_id || '—'}</code>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-500">Created</p>
                <p className="mt-1 text-sm text-slate-900">{formatCreatedAt(client.created_at)}</p>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Raw payload</p>
                <pre className="overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-emerald-100">
                  {JSON.stringify(client, null, 2)}
                </pre>
              </div>
            </div>
          </details>

          {(canUpdate || canDelete) && client.source !== 'demo' && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
            {canUpdate && (recordStatus === 'active' ? <button ref={statusActionRef} type="button" onClick={() => setShowDeactivateModal(true)} disabled={isChangingStatus || isDeleting} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-50"><PowerOff aria-hidden="true" className="h-4 w-4" />Deactivate entity</button> : recordStatus === 'inactive' ? <button ref={statusActionRef} type="button" onClick={() => void handleStatusChange('active')} disabled={isChangingStatus || isDeleting} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-hq-teal hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:opacity-50"><Power aria-hidden="true" className="h-4 w-4" />{isChangingStatus ? 'Activating...' : 'Activate entity'}</button> : <span />)}
            {canDelete && <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete entity
            </button>}
          </div>}
        </>
      ) : !error ? (
        <Card>
          <p className="text-sm text-slate-600">Entity not found.</p>
        </Card>
      ) : null}

      <ConfirmDangerModal
        open={showDeactivateModal}
        title="Deactivate entity?"
        description="The entity and its credentials will be kept, but QuickBooks access, scheduled checks, and notifications will stop for both prod and sandbox until you activate it again."
        confirmLabel="Deactivate entity"
        confirmingLabel="Deactivating..."
        onCancel={() => setShowDeactivateModal(false)}
        onConfirm={() => void handleStatusChange('inactive')}
        isConfirming={isChangingStatus}
      />
      <ConfirmDangerModal
        open={showDeleteModal}
        title="Delete entity?"
        description="This will permanently remove the entity from FinOps. This action can’t be undone."
        confirmLabel="Delete"
        confirmText="DELETE"
        confirmTextLabel="Type to confirm"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        isConfirming={isDeleting}
      />
    </div>
  )
}

function formatCreatedAt(value: string | null | undefined) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
