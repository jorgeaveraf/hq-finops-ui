import { apiRequest } from '../../../api/finopsApi'

export type QboEnvironment = 'prod' | 'sandbox'
export type QboConnectionState = 'connected' | 'reconnect-needed' | 'unavailable'

export type QboConnection = {
  environment: QboEnvironment
  is_connected: boolean | null
  connection_checked_at: string | null
  realm_id: string | null
}

export type QboClient = {
  id: string
  source?: 'demo'
  name: string
  client_group: string | null
  status: string
  created_at?: string | null
  metadata: Record<string, unknown> | null
  environments: QboEnvironment[]
  connections?: QboConnection[]
  connection_state?: QboConnectionState
}

export type CreateClientPayload = {
  entityName: string
  clientGroup: string
  environment: QboEnvironment
  extraFields?: Record<string, unknown>
}

export type QboReconnectResponse = {
  client_id: string
  environment: QboEnvironment | string
  redirect_url?: string
  message?: string
  request_id?: string
}

export async function fetchReconnectLink(params: { clientId: string; environment: QboEnvironment | string }) {
  const query = new URLSearchParams({ environment: params.environment })
  return apiRequest<QboReconnectResponse>(`/clients/${params.clientId}/reconnect?${query}`)
}

export async function listClients(clientGroup?: string, includeConnectionStatus = false): Promise<QboClient[]> {
  const params = new URLSearchParams()
  if (clientGroup) params.set('client_group', clientGroup)
  if (includeConnectionStatus) params.set('connection_status', '1')
  const query = params.size ? `?${params}` : ''
  return apiRequest<QboClient[]>(`/clients${query}`)
}

export async function getClient(clientId: string): Promise<QboClient> {
  return apiRequest<QboClient>(`/clients/${clientId}`)
}

export async function deleteClient(clientId: string): Promise<void> {
  await apiRequest(`/clients/${clientId}`, { method: 'DELETE' })
}

export async function createClient(payload: CreateClientPayload, idempotencyKey: string = crypto.randomUUID()): Promise<QboClient> {
  return apiRequest<QboClient>('/clients', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      name: payload.entityName,
      client_group: payload.clientGroup,
      metadata: { ...(payload.extraFields || {}), tier: payload.environment },
    }),
  })
}

export function describeGatewayError(error: unknown, fallback = 'Unable to reach FinOps API') {
  if (error instanceof Error) return error.message
  return fallback
}
