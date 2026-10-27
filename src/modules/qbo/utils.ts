import type { QboClient, QboConnection, QboEnvironment } from './api/qboGatewayClient'

export function getClientId(client: QboClient) {
  return client.id
}

export function getClientName(client: QboClient) {
  return client.name || client.id
}

export function formatClientGroup(clientGroup: string | null | undefined) {
  if (!clientGroup) return 'No client assigned'
  return clientGroup.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function toClientGroup(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function getClientRecordStatus(client: QboClient) {
  const metadataStatus = typeof client.metadata?.status === 'string' ? client.metadata.status : null
  return (metadataStatus || client.status || 'unknown').trim().toLowerCase()
}

export function getClientEnvironments(client: QboClient): QboEnvironment[] {
  const fromConnections = client.connections?.map((connection) => connection.environment) || []
  const fromList = client.environments || []
  const tier = client.metadata?.tier
  const fromMetadata: QboEnvironment[] = tier === 'sandbox' || tier === 'prod' ? [tier] : []
  return [...new Set([...fromConnections, ...fromList, ...fromMetadata])]
}

export type ConnectionStatus = {
  label: 'Connected' | 'Reconnect needed' | 'Unavailable'
  tone: 'success' | 'warning' | 'neutral'
  reason?: 'Not checked' | 'Disconnected'
}

export function getConnectionStatus(connection?: QboConnection): ConnectionStatus {
  if (!connection?.connection_checked_at || connection.is_connected === null) {
    return { label: 'Unavailable', tone: 'neutral', reason: 'Not checked' }
  }
  return connection.is_connected
    ? { label: 'Connected', tone: 'success' }
    : { label: 'Reconnect needed', tone: 'warning', reason: 'Disconnected' }
}

export function formatCheckedAt(checkedAt: string | null | undefined) {
  if (!checkedAt) return 'No review recorded'
  const date = new Date(checkedAt)
  return Number.isNaN(date.getTime()) ? 'No review recorded' : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
