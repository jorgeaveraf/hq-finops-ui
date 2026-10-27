import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, RefreshCw, Trash2 } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { ConfirmDangerModal } from '../../../components/ConfirmDangerModal'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { deleteClient, describeGatewayError, getClient } from '../api/qboGatewayClient'
import type { QboClient } from '../api/qboGatewayClient'
import { formatCheckedAt, formatClientGroup, getClientEnvironments, getClientId, getClientName, getClientRecordStatus, getConnectionStatus } from '../utils'
import { ReconnectButton } from '../components/ReconnectButton'

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<QboClient | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
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
  const clientIdentifier = client ? getClientId(client) : ''
  const recordStatus = client ? getClientRecordStatus(client) : 'unknown'
  const recordStatusLabel = recordStatus === 'active' ? 'Active entity' : recordStatus === 'inactive' ? 'Inactive entity' : 'Entity status unavailable'
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Clients & Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">Entity detail</h1>
        </div>
        <Button asChild variant="secondary">
          <Link to="/qbo/clients">Back to list</Link>
        </Button>
      </div>

      {error && <Alert title="Error" description={error} variant="error" />}
      {deleteError && <Alert title="Delete failed" description={deleteError} variant="error" />}

      {isLoading ? (
        <Card>
          <p className="text-sm text-slate-600">Loading entity...</p>
        </Card>
      ) : client ? (
        <>
          <Card
            title={getClientName(client)}
            description={<span className="-ml-0.5 inline-block max-w-full break-words rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{client.client_group ? `Client: ${formatClientGroup(client.client_group)}` : 'No client assigned'}</span>}
            actions={<div className="flex items-center gap-2">{client.source === 'demo' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Demo data</span>}<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${recordStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{recordStatusLabel}</span></div>}
          />

          <Card
            title="QuickBooks connection"
            titleSuffix={<InfoTooltip label="About QuickBooks connection" text="QuickBooks connection status and authorization options for this entity." />}
            actions={client.source !== 'demo' ? <button type="button" onClick={handleRefresh} disabled={isRefreshing} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-hq-teal hover:bg-hq-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />{isRefreshing ? 'Reloading…' : 'Reload saved status'}</button> : undefined}
          >
            {refreshMessage && <p className="mb-3 text-xs text-slate-600" role="status">{refreshMessage}</p>}
            <div className="space-y-3">
              {connectionRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-2.5 py-1 text-sm font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />Unavailable
                  </span>
                  <p className="mt-2 text-sm text-slate-600">Reason: No credential</p>
                  <div className="mt-3 border-t border-slate-200 pt-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Entity ID</p><code className="mt-1 block break-all text-sm font-semibold text-slate-900">{clientIdentifier}</code></div>
                </div>
              ) : connectionRows.map(({ environment, credential, status }, index) => (
                <div key={environment} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {connectionRows.length > 1 && <span className="text-xs font-semibold uppercase text-slate-500">Credential {index + 1}</span>}
                    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-semibold ${status.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : status.tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                      <span className={`h-2 w-2 rounded-full ${status.tone === 'success' ? 'bg-emerald-500' : status.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      {status.label}
                    </span>
                  </div>
                  {!credential && <p className="mt-2 text-sm text-slate-600">Reason: No credential</p>}
                  {credential && status.reason && <p className="mt-2 text-sm text-slate-600">Reason: {status.reason}</p>}
                  {credential && <p className="mt-2 text-sm text-slate-600">Last checked: {formatCheckedAt(credential.connection_checked_at)}</p>}
                  <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-500">QuickBooks environment</p>
                      <p className="mt-1 font-semibold text-slate-900">{environment}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-500">Entity ID</p>
                      <code className="mt-1 block break-all text-sm font-semibold text-slate-900">{clientIdentifier}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {client.source !== 'demo' && environmentOptions.length > 0 && (
              <details className="mt-5 rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-hq-teal/5 hover:text-hq-teal focus-visible:bg-hq-teal/5 focus-visible:text-hq-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">{isInitialConnection ? 'Connect QuickBooks' : 'Reconnect QuickBooks'}</summary>
                <div className="border-t border-slate-200 px-4 py-4">
                  <p className="mb-3 text-sm text-slate-600">{isInitialConnection ? 'Authorize this entity in QuickBooks to establish its first connection.' : 'Start a new QuickBooks authorization only if this connection needs repair.'}</p>
                  <ReconnectButton
                    key={`${clientIdentifier}-${refreshVersion}`}
                    clientId={clientIdentifier}
                    environments={environmentOptions}
                    mode={isInitialConnection ? 'connect' : 'reconnect'}
                    className="max-w-lg"
                    onAuthorizationStarted={() => { authorizationStartedAt.current = Date.now(); setRefreshMessage(null) }}
                  />
                </div>
              </details>
            )}
          </Card>

          <details className="group rounded-2xl bg-white shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal">
              <span>
                <span className="block text-lg font-semibold text-slate-900">Technical details</span>
                <span className="mt-1 block text-sm text-slate-600">Identifiers and raw data</span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-slate-100 px-6 py-5">
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

          {client.source !== 'demo' && <div className="flex justify-end border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete entity
            </button>
          </div>}
        </>
      ) : !error ? (
        <Card>
          <p className="text-sm text-slate-600">Entity not found.</p>
        </Card>
      ) : null}

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
