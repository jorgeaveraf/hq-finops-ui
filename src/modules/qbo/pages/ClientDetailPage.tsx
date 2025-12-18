import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { ConfirmDangerModal } from '../../../components/ConfirmDangerModal'
import { deleteClient, describeGatewayError, getClient } from '../api/qboGatewayClient'
import type { QboClient, QboEnvironment } from '../api/qboGatewayClient'
import { getClientEnvironments, getClientId, getClientName, getConnectionStatus } from '../utils'
import { ReconnectButton } from '../components/ReconnectButton'

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<QboClient | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

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

  const environmentOptions =
    client && getClientEnvironments(client).length > 0
      ? getClientEnvironments(client)
      : (['prod', 'sandbox'] as QboEnvironment[])
  const clientIdentifier = client ? getClientId(client) : ''
  const connection = client ? getConnectionStatus(client) : { label: 'Disconnected', tone: 'neutral' }
  const credentialRealmId =
    client && Array.isArray((client as Record<string, unknown>).credentials)
      ? ((client as Record<string, unknown>).credentials as Array<Record<string, unknown>>).find(
          (entry) => typeof entry.realm_id === 'string' && entry.realm_id.trim().length > 0,
        )?.realm_id
      : undefined
  const resolvedRealmId = client?.realm_id || credentialRealmId
  const statusColor =
    connection.tone === 'success'
      ? 'bg-emerald-500'
      : connection.tone === 'warning'
        ? 'bg-amber-500'
        : 'bg-slate-400'

  const handleDelete = async () => {
    if (!clientId) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      await deleteClient(clientId)
      navigate('/qbo/clients', { state: { message: 'Client deleted' } })
    } catch (err) {
      setDeleteError(describeGatewayError(err, 'Unable to delete client right now.'))
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Clients & Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">Client detail</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowDeleteModal(true)}
            disabled={isDeleting || isLoading || !client}
            className="text-rose-700 hover:text-rose-800 border-rose-100"
          >
            Delete client
          </Button>
          <Button asChild variant="secondary">
            <Link to="/qbo/clients">Back to list</Link>
          </Button>
        </div>
      </div>

      {error && <Alert title="Error" description={error} variant="error" />}
      {deleteError && <Alert title="Delete failed" description={deleteError} variant="error" />}

      {isLoading ? (
        <Card>
          <p className="text-sm text-slate-600">Loading client from qbo-gateway...</p>
        </Card>
      ) : client ? (
        <>
          <Card
            title={getClientName(client)}
            description="Manage this QuickBooks connection."
            actions={
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                {connection.label}
              </span>
            }
          >
            <div className="flex flex-wrap gap-3 text-sm text-slate-700">
              <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">
                Environments: {environmentOptions.join(', ')}
              </span>
              <span className="px-2 py-1 rounded-lg bg-slate-100">
                ID: <code className="text-xs">{clientIdentifier}</code>
              </span>
              {resolvedRealmId && (
                <span className="px-2 py-1 rounded-lg bg-slate-100">
                  realm_id: <code className="text-xs">{resolvedRealmId}</code>
                </span>
              )}
            </div>
          </Card>

          <Card
            title="QuickBooks connection"
            description="Reconnect QuickBooks to refresh authorization or fix access issues."
          >
            <ReconnectButton
              clientId={clientIdentifier}
              clientName={client ? getClientName(client) : undefined}
              environments={environmentOptions}
              buttonLabel="Reconnect QuickBooks"
              className="max-w-lg"
              inlinePanel
              onRefresh={() => {
                if (!clientId) return
                setIsLoading(true)
                getClient(clientId)
                  .then((data) => setClient(data))
                  .catch((err) => setError(describeGatewayError(err, 'Unable to refresh status.')))
                  .finally(() => setIsLoading(false))
              }}
            />
          </Card>

          <Card title="Client details" description="Key attributes for this client.">
            <div className="grid gap-3 md:grid-cols-2 text-sm text-slate-700">
              <DetailItem label="Name">{getClientName(client)}</DetailItem>
              <DetailItem label="Status">{connection.label}</DetailItem>
              <DetailItem label="Tier / Environment">{environmentOptions.join(', ')}</DetailItem>
              <DetailItem label="Realm ID">{resolvedRealmId || '—'}</DetailItem>
            </div>
          </Card>

          <Card title="Technical details" description="Raw payload and identifiers." actions={<span className="text-xs text-slate-500">Collapsed</span>}>
            <details className="rounded-xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
                Show technical payload
              </summary>
              <div className="border-t border-slate-200">
                <pre className="bg-slate-900 text-emerald-100 text-xs rounded-b-xl p-4 overflow-auto">
                  {JSON.stringify(client, null, 2)}
                </pre>
              </div>
            </details>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-600">Client not found.</p>
        </Card>
      )}

      <ConfirmDangerModal
        open={showDeleteModal}
        title="Delete client?"
        description="This will remove the client record from the gateway. This action can’t be undone."
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

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-slate-100 bg-white px-3 py-2">
      <p className="text-[11px] uppercase font-semibold text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{children}</p>
    </div>
  )
}
