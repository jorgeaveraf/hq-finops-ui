import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  Briefcase,
  Building2,
  Factory,
  Landmark,
  Link2,
  Plane,
  PlugZap,
  Plus,
  RefreshCcw,
  Ship,
  Trash2,
} from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { ConfirmDangerModal } from '../../../components/ConfirmDangerModal'
import { deleteClient, describeGatewayError, getClient, listClients } from '../api/qboGatewayClient'
import type { QboClient, QboEnvironment } from '../api/qboGatewayClient'
import { getClientEnvironments, getClientId, getClientName, getConnectionStatus } from '../utils'
import { ReconnectButton } from '../components/ReconnectButton'

const CLIENT_DETAIL_TTL_MS = 60_000
const clientDetailCache = new Map<string, { expiresAt: number; value: QboClient }>()
const clientDetailInflight = new Map<string, Promise<QboClient>>()

export function ClientListPage() {
  const [clients, setClients] = useState<QboClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const location = useLocation()

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listClients()
      setClients(data)
    } catch (err) {
      setError(describeGatewayError(err, 'Unable to load clients from qbo-gateway.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (location.state && (location.state as { message?: string }).message) {
      setSuccessMessage((location.state as { message?: string }).message ?? null)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const clientCountText = useMemo(
    () => (clients.length === 1 ? '1 client' : `${clients.length} clients`),
    [clients.length],
  )

  const handleDeleted = (removedId: string) => {
    setClients((prev) => prev.filter((c) => getClientId(c) !== removedId))
    setSuccessMessage('Client deleted')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-hq-teal">Clients & Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">QuickBooks Online clients</h1>
        </div>
        <Button asChild icon={<Plus className="h-4 w-4" />}>
          <Link to="/qbo/clients/new">Create client</Link>
        </Button>
      </div>

      <Card
        title="Clients"
        description="View from clients stored in qbo-gateway."
        actions={
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {clientCountText}
          </span>
        }
      >
        {error && <Alert title="Unable to load clients" description={error} variant="error" />}
        {rowError && <Alert title="Action failed" description={rowError} variant="error" />}
        {successMessage && <Alert title={successMessage} variant="success" />}

        {isLoading ? (
          <div className="text-sm text-slate-600 flex items-center gap-2 mt-2">
            <RefreshCcw className="h-4 w-4 animate-spin text-hq-teal" />
            Loading clients from qbo-gateway...
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 flex items-center justify-between flex-col gap-3 md:flex-row">
            <div>
              <p className="font-semibold text-slate-900">No clients found</p>
              <p className="text-slate-600">Create one to start the OAuth connection flow.</p>
            </div>
            <Button asChild size="sm" icon={<Plus className="h-4 w-4" />}>
              <Link to="/qbo/clients/new">Create client</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold w-2/5 text-center">Client</th>
                  <th className="px-4 py-3 font-semibold w-1/5 text-center">Connection</th>
                  <th className="px-4 py-3 font-semibold w-2/5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client, idx) => {
                  const clientId = getClientId(client) || client.name || `client-${idx}`
                  return (
                    <ClientRow
                      key={clientId}
                      client={client}
                      onDeleted={handleDeleted}
                      onError={(msg) => setRowError(msg)}
                      onRefreshList={load}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function ClientRow({
  client,
  onDeleted,
  onError,
  onRefreshList,
}: {
  client: QboClient
  onDeleted: (id: string) => void
  onError: (msg: string | null) => void
  onRefreshList: () => void
}) {
  const environments = getClientEnvironments(client)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [detailClient, setDetailClient] = useState<QboClient | null>(null)

  const envOptions =
    environments.length > 0 ? [...environments] : (['prod', 'sandbox'] as (QboEnvironment | string)[])
  const connection = getConnectionStatus(detailClient ?? client)
  const clientId = getClientId(client)
  const metadataStatus =
    typeof client.metadata === 'object' && client.metadata !== null
      ? ((client.metadata as Record<string, unknown>).status as string | undefined)
      : undefined
  const displayStatus = metadataStatus || client.status || '—'
  const fortuneIcons = [PlugZap, Briefcase, Building2, Factory, Ship, Plane, Landmark]
  const iconIndex =
    clientId && clientId.length > 0
      ? clientId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % fortuneIcons.length
      : 0
  const FortuneIcon = fortuneIcons[iconIndex]

  useEffect(() => {
    const normalizedAccessStatus =
      typeof client.access_status === 'string' ? client.access_status.trim().toLowerCase() : ''
    if (!clientId || normalizedAccessStatus === 'none') {
      setDetailClient(null)
      return
    }

    const cached = clientDetailCache.get(clientId)
    if (cached && cached.expiresAt > Date.now()) {
      setDetailClient(cached.value)
      return
    }

    let isMounted = true
    const fetchPromise =
      clientDetailInflight.get(clientId) ??
      getClient(clientId).finally(() => {
        clientDetailInflight.delete(clientId)
      })
    clientDetailInflight.set(clientId, fetchPromise)

    fetchPromise
      .then((data) => {
        clientDetailCache.set(clientId, { value: data, expiresAt: Date.now() + CLIENT_DETAIL_TTL_MS })
        if (isMounted) setDetailClient(data)
      })
      .catch(() => {
        if (isMounted) setDetailClient(null)
      })

    return () => {
      isMounted = false
    }
  }, [clientId, client])

  const statusColor =
    connection.tone === 'success'
      ? 'bg-emerald-500'
      : connection.tone === 'warning'
        ? 'bg-amber-500'
        : 'bg-slate-400'

  return (
    <tr>
      <td className="px-4 py-4 align-top">
        <div className="font-semibold text-slate-900 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-hq-teal/10 text-hq-teal">
            <FortuneIcon className="h-4 w-4" />
          </span>
          <div className="relative group max-w-[240px]">
            <p className="truncate text-sm text-slate-900">{getClientName(client)}</p>
            <div className="pointer-events-none absolute left-0 top-full mt-1 rounded-lg bg-slate-900 text-white text-xs px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-lg">
              {getClientName(client)}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Status: <span className="font-semibold text-slate-700 capitalize">{displayStatus}</span>
        </p>
      </td>
      <td className="px-4 py-4 align-middle w-36">
        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700 capitalize">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          {connection.label}
        </span>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="flex flex-wrap gap-3 items-center justify-center">
          <ActionChip to={`/qbo/clients/${clientId}`} icon={<Link2 className="h-4 w-4" />} label="View" />
          <ReconnectButton
            clientId={clientId}
            clientName={getClientName(client)}
            environments={envOptions}
            size="sm"
            showResult
            buttonLabel="Reconnect QuickBooks"
            className="max-w-xs"
            revealLabelOnHover
            onRefresh={onRefreshList}
          />
          <IconActionButton
            onClick={() => setShowDeleteModal(true)}
            disabled={isDeleting}
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            danger
          />
        </div>

        <ConfirmDangerModal
          open={showDeleteModal}
          title="Delete client?"
          description="This will remove the client record from the gateway. This action can’t be undone."
          confirmLabel="Delete"
          confirmText="DELETE"
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={async () => {
            if (!clientId) return
            setIsDeleting(true)
            onError(null)
            try {
              await deleteClient(clientId)
              onDeleted(clientId)
            } catch (err) {
              onError(describeGatewayError(err, 'Unable to delete client right now.'))
            } finally {
              setIsDeleting(false)
              setShowDeleteModal(false)
            }
          }}
          isConfirming={isDeleting}
        />
      </td>
    </tr>
  )
}

function ActionChip({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow hover:border-hq-teal/50"
    >
      {icon}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 -translate-x-1/2 translate-y-1 opacity-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg transition-all duration-150 group-hover:translate-y-2 group-hover:opacity-100 whitespace-nowrap">
        {label}
      </span>
    </Link>
  )
}

function IconActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow',
        danger ? 'text-rose-700 hover:border-rose-200' : 'hover:border-hq-teal/50',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {icon}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 -translate-x-1/2 translate-y-1 opacity-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg transition-all duration-150 group-hover:translate-y-2 group-hover:opacity-100 whitespace-nowrap">
        {label}
      </span>
    </button>
  )
}
