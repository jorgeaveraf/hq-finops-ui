import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { MyApiKeysPage } from '../modules/auth/MyApiKeysPage'

afterEach(() => vi.restoreAllMocks())

function mockKeyApi() {
  const keys: Array<Record<string, unknown>> = []
  const grants: Record<string, Array<Record<string, unknown>>> = {}
  const requests: Array<{ path: string; init?: RequestInit }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    requests.push({ path, init })
    const method = init?.method ?? 'GET'
    if (path.endsWith('/access/session')) return Response.json({ user: { name: 'Ana', email: 'ana@example.test', issuer: 'https://accounts.google.com', sub: 'ana' }, csrf: 'csrf' })
    if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Operator', status: 'active' }, effective_grants: [{ id: 'grant-1', operation: 'qbo.read', client_id: 'client-1', environment: 'prod' }] })
    if (path.endsWith('/access/keys/policy')) return Response.json({ active_limit: 5, active_count: keys.filter((key) => key.status === 'active').length, maximum_expiration_days: 120, rotation_overlap_days: 7 })
    if (path.endsWith('/access/keys') && method === 'GET') return Response.json(keys)
    if (path.includes('/access/grants?api_key_id=')) return Response.json(grants[path.split('=')[1]] ?? [])
    if (path.endsWith('/access/keys') && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      const key = { id: 'key-1', owner_user_id: 'user-1', name: body.name, secret_suffix: 'xyz123', status: 'active', created_at: '2026-11-17T00:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, replaces_key_id: null }
      keys.push(key)
      return Response.json({ ...key, secret: 'qgk_private_xyz123' }, { status: 201 })
    }
    if (path.endsWith('/access/grants') && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      grants[body.api_key_id] = [...(grants[body.api_key_id] ?? []), { id: 'key-grant-1', ...body }]
      return Response.json(grants[body.api_key_id].at(-1), { status: 201 })
    }
    if (path.endsWith('/revoke') && method === 'POST') {
      keys[0].status = 'revoked'; keys[0].revoked_at = '2026-11-17T01:00:00Z'
      return Response.json(keys[0])
    }
    if (path.endsWith('/rotate') && method === 'POST') {
      const replacement = { ...keys[0], id: 'key-2', secret_suffix: 'new456', replaces_key_id: 'key-1' }
      keys.push(replacement)
      grants['key-2'] = [...(grants['key-1'] ?? [])]
      return Response.json({ ...replacement, secret: 'qgk_replacement_new456' }, { status: 201 })
    }
    return Response.json({ message: 'Not found' }, { status: 404 })
  })
  return { requests }
}

describe('user-owned API keys', () => {
  it('creates a scoped key and reveals its complete secret only until dismissed', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<AuthProvider><MyApiKeysPage /></AuthProvider>))
    expect(await screen.findByText('0 of 5 active keys. Rotation counts both keys during the 7-day overlap.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create API key' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Bills Automation' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Read QuickBooks data/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    expect(screen.getByRole('dialog', { name: 'New API key secret' })).toBeInTheDocument()
    expect(await screen.findByTestId('new-key-secret')).toHaveTextContent('qgk_private_xyz123')
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(issuance?.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String), 'X-CSRF-Token': 'csrf' })
    expect(JSON.parse(String(issuance?.init?.body))).toEqual({ name: 'Bills Automation', expires_at: null })
    const grant = requests.find((request) => request.path.endsWith('/access/grants') && request.init?.method === 'POST')
    expect(JSON.parse(String(grant?.init?.body))).toMatchObject({ api_key_id: 'key-1', client_id: 'client-1', environment: 'prod', operation: 'qbo.read' })
    fireEvent.click(screen.getByRole('button', { name: 'I saved it' }))
    expect(screen.queryByText('qgk_private_xyz123')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('••••xyz123')).toBeInTheDocument()
  })

  it('cancels the modal without issuing a key', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<AuthProvider><MyApiKeysPage /></AuthProvider>))
    const trigger = await screen.findByRole('button', { name: 'Create API key' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
  })

  it('requires confirmation before immediately revoking a key', async () => {
    mockKeyApi()
    await act(async () => render(<AuthProvider><MyApiKeysPage /></AuthProvider>))
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: /Read QuickBooks data/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    fireEvent.click(screen.getByRole('button', { name: 'I saved it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(screen.getByRole('dialog', { name: 'Revoke key' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })))
    expect(await screen.findByText('Key revoked. Requests using it are now rejected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })

  it('rotates with a new issuance request and shows only the replacement secret', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<AuthProvider><MyApiKeysPage /></AuthProvider>))
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: /Read QuickBooks data/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    fireEvent.click(screen.getByRole('button', { name: 'I saved it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })))
    expect(await screen.findByTestId('new-key-secret')).toHaveTextContent('qgk_replacement_new456')
    const rotation = requests.find((request) => request.path.endsWith('/rotate'))
    expect(rotation?.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) })
    expect(screen.getByText('••••new456')).toBeInTheDocument()
    expect(screen.queryByText('qgk_private_xyz123')).not.toBeInTheDocument()
  })
})
