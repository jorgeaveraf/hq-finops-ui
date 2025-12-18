import type { QboClient, QboEnvironment } from './api/qboGatewayClient'

export function getClientName(client: QboClient) {
  return client.label || client.name || getClientId(client)
}

export function getClientEnvironments(client: QboClient): (QboEnvironment | string)[] {
  if (Array.isArray(client.environments) && client.environments.length > 0) {
    return client.environments
  }

  if (client.environment) {
    return [client.environment]
  }

  const metadataEnv =
    typeof client.metadata === 'object' && client.metadata !== null
      ? ((client.metadata.env || client.metadata.tier) as string | undefined)
      : undefined
  if (metadataEnv) {
    return [metadataEnv]
  }

  const envFromAltField = (client as Record<string, unknown>).env
  if (typeof envFromAltField === 'string') {
    return [envFromAltField]
  }

  return []
}

export function getClientStatus(client: QboClient) {
  return String(client.access_status || client.status || client.connection_status || 'unknown')
}

export function getClientId(client: QboClient) {
  return client.client_id || client.id || ''
}

export type ConnectionStatus = {
  label: 'Connected' | 'Expired' | 'Disconnected'
  tone: 'success' | 'warning' | 'neutral'
}

export function getConnectionStatus(client: QboClient): ConnectionStatus {
  const normalized = (value?: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value ? String(value).toLowerCase() : ''

  const accessStatus = normalized(client.access_status)
  const connStatus = normalized(client.connection_status)
  const tokenStatus = normalized((client as Record<string, unknown>).token_status)
  const authStatus = normalized((client as Record<string, unknown>).auth_status)
  const hasCredentials = Boolean((client as Record<string, unknown>).has_credentials)

  const hasRealm = Boolean((client as Record<string, unknown>).realm_id || client.realm_id)
  const hasTokens =
    Boolean((client as Record<string, unknown>).access_token) ||
    Boolean((client as Record<string, unknown>).refresh_token) ||
    Boolean((client as Record<string, unknown>).connected_at)

  const expiresAtRaw =
    (client as Record<string, unknown>).access_expires_at ||
    (client as Record<string, unknown>).expires_at ||
    (client as Record<string, unknown>).token_expires_at
  const expiresAt = typeof expiresAtRaw === 'string' ? new Date(expiresAtRaw) : null
  const isExpiredDate = expiresAt ? expiresAt.getTime() < Date.now() : false

  const hasErrorHint = normalized((client as Record<string, unknown>).last_error)?.includes('expire')

  const statuses = [accessStatus, connStatus, tokenStatus, authStatus].filter(Boolean)
  const explicitConnected = statuses.some((s) => ['connected', 'active', 'valid', 'ok'].includes(s))
  const explicitExpired = statuses.some((s) => ['expired', 'invalid', 'revoked'].includes(s))

  if (accessStatus === 'none' && !hasCredentials && !hasRealm && !hasTokens) {
    return { label: 'Disconnected', tone: 'neutral' }
  }

  if (accessStatus !== 'none' && Array.isArray((client as Record<string, unknown>).credentials)) {
    const creds = (client as Record<string, unknown>).credentials as Array<Record<string, unknown>>
    const refreshDates = creds
      .map((c) => (typeof c.refresh_expires_at === 'string' ? new Date(c.refresh_expires_at) : null))
      .filter((d): d is Date => !!d)
    if (refreshDates.length > 0) {
      const maxRefresh = refreshDates.reduce((latest, current) =>
        current.getTime() > latest.getTime() ? current : latest,
      )
      if (maxRefresh.getTime() >= Date.now()) {
        return { label: 'Connected', tone: 'success' }
      }
      return { label: 'Expired', tone: 'warning' }
    }
  }

  if (accessStatus === 'expired' || explicitExpired || isExpiredDate || hasErrorHint) {
    return { label: 'Expired', tone: 'warning' }
  }

  if (explicitConnected || accessStatus === 'active' || connStatus === 'connected') {
    return { label: 'Connected', tone: 'success' }
  }

  if ((hasCredentials || hasRealm || hasTokens) && !isExpiredDate) {
    return { label: 'Connected', tone: 'success' }
  }

  return { label: 'Disconnected', tone: 'neutral' }
}
