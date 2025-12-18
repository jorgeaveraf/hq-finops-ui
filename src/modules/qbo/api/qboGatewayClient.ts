export type QboEnvironment = 'prod' | 'sandbox'

export type QboClient = {
  client_id?: string
  id?: string
  label?: string
  name?: string
  environment?: QboEnvironment | string
  environments?: (QboEnvironment | string)[]
  connection_status?: string
  status?: string
  access_status?: string
  access_expires_at?: string | null
  has_credentials?: boolean
  realm_id?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export type CreateClientPayload = {
  label: string
  environment: QboEnvironment
  realm_id?: string
  extraFields?: Record<string, unknown>
}

export type QboReconnectResponse = {
  client_id: string
  environment: QboEnvironment | string
  redirect_url?: string
  message?: string
  request_id?: string
  [key: string]: unknown
}

export class QboGatewayError extends Error {
  status: number
  body: string
  parsedBody?: unknown

  constructor(status: number, body: string, parsedBody?: unknown) {
    super(
      typeof parsedBody === 'object' && parsedBody !== null && 'message' in parsedBody
        ? String((parsedBody as Record<string, unknown>).message)
        : `Gateway request failed with status ${status}`,
    )
    this.name = 'QboGatewayError'
    this.status = status
    this.body = body
    this.parsedBody = parsedBody
  }
}

const API_PREFIX = '/qbo-api'

function withIdempotency(headers?: HeadersInit): HeadersInit {
  const normalizedHeaders: Record<string, string> = {}

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalizedHeaders[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      normalizedHeaders[key] = value
    }
  } else if (headers) {
    Object.assign(normalizedHeaders, headers)
  }

  return {
    ...normalizedHeaders,
    'Idempotency-Key': crypto.randomUUID(),
  }
}

async function qboRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const initHeaders =
    method === 'POST' || method === 'PATCH' || method === 'DELETE'
      ? withIdempotency(init?.headers)
      : init?.headers
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(initHeaders ?? {}),
    },
  })
  const bodyText = await response.text()

  let parsedBody: unknown
  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText)
    } catch {
      parsedBody = undefined
    }
  }

  if (!response.ok) {
    throw new QboGatewayError(response.status, bodyText || 'Gateway request failed', parsedBody)
  }

  if (!bodyText) {
    return {} as T
  }

  if (parsedBody === undefined) {
    throw new Error('Gateway response was not valid JSON.')
  }

  return parsedBody as T
}

type ReconnectParams = {
  clientId: string
  environment: QboEnvironment | string
}

export async function fetchReconnectLink(params: ReconnectParams): Promise<QboReconnectResponse> {
  const searchParams = new URLSearchParams({
    client_id: params.clientId,
    env: params.environment,
  })
  return qboRequest<QboReconnectResponse>(`/auth/connect?${searchParams.toString()}`)
}

export async function listClients(): Promise<QboClient[]> {
  return qboRequest<QboClient[]>('/clients?summary=1')
}

export async function getClient(clientId: string): Promise<QboClient> {
  return qboRequest<QboClient>(`/clients/${clientId}`)
}

export async function deleteClient(clientId: string): Promise<void> {
  await qboRequest<void>(`/clients/${clientId}`, {
    method: 'DELETE',
  })
}

export async function createClient(payload: CreateClientPayload): Promise<QboClient> {
  const metadata = {
    ...(payload.extraFields ?? {}),
    tier: payload.environment,
  }

  const body: Record<string, unknown> = {
    name: payload.label,
    label: payload.label,
    status: 'active',
    metadata,
    ...(payload.realm_id ? { realm_id: payload.realm_id } : {}),
  }

  return qboRequest<QboClient>('/clients', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function describeGatewayError(error: unknown, fallback = 'Unable to reach qbo-gateway') {
  if (error instanceof QboGatewayError) {
    if (error.status === 401) return 'qbo-gateway rejected the API key (401).'
    if (error.status === 404) return 'Not found on qbo-gateway (404).'
    if (error.status >= 500) return 'qbo-gateway returned a server error. Please retry.'
    return error.message
  }
  if (error instanceof Error) return error.message
  return fallback
}
