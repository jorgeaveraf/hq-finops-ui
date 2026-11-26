import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { within, act, fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { MyApiKeysPage } from '../modules/auth/MyApiKeysPage'

afterEach(() => vi.restoreAllMocks())

async function reviewAndCreateKey() {
  const selectedEntity = screen.getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true'
    && /^Select /.test(button.getAttribute('aria-label') ?? ''))
  if (!selectedEntity) {
    const firstEntity = screen.queryByRole('button', { name: 'Select ACME Sandbox' })
    if (firstEntity) fireEvent.click(firstEntity)
  }
  if (screen.getByRole('button', { name: 'Create key' }).hasAttribute('disabled')) {
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
  }
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
}

async function openCreate(purpose: 'qbo' | 'entities' = 'entities') {
  fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
  fireEvent.click(screen.getByRole('button', { name: purpose === 'qbo' ? /Work with QuickBooks data/ : /Administer QBO Gateway entities/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to key details' }))
}

function mockKeyApi(initialKeys: Array<Record<string, unknown>> = [], initialGrants: Record<string, Array<Record<string, unknown>>> = {}, userGrants: Array<Record<string, unknown>> = [{ id: 'grant-1', operation: 'client.read', client_id: 'client-1', environment: null }]) {
  const keys = [...initialKeys]
  const grants = { ...initialGrants }
  const requests: Array<{ path: string; init?: RequestInit }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    requests.push({ path, init })
    const method = init?.method ?? 'GET'
    if (path.endsWith('/access/session')) return Response.json({ user: { name: 'Ana', email: 'ana@example.test', issuer: 'https://accounts.google.com', sub: 'ana' }, csrf: 'csrf' })
    if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Operator', status: 'active' }, effective_grants: [...userGrants, { id: 'entity-manage', operation: 'entities.manage', client_id: null, environment: null }] })
    if (path.endsWith('/access/keys/policy')) return Response.json({ active_limit: 10, active_count: keys.filter((key) => key.status === 'active' && (!key.expires_at || new Date(String(key.expires_at)).getTime() > Date.now())).length, maximum_expiration_days: 120 })
    if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME Sandbox', environments: ['sandbox', 'prod'] }, { id: 'client-2', name: 'Northwind' }])
    if (path.endsWith('/access/keys') && method === 'GET') return Response.json(keys)
    if (path.includes('/access/grants?api_key_id=')) return Response.json(grants[path.split('=')[1]] ?? [])
    if (path.endsWith('/access/keys') && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      const key = { id: 'key-1', owner_user_id: 'user-1', name: body.name, purpose: body.purpose, secret_suffix: 'xyz123', status: 'active', created_at: '2026-11-17T00:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, replaces_key_id: null }
      keys.push(key)
      grants[key.id] = (body.grants ?? []).map((grant: Record<string, unknown>, index: number) => ({ id: `key-grant-${index + 1}`, api_key_id: key.id, ...grant }))
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
      keys[0].status = 'revoked'; keys[0].revoked_at = new Date().toISOString()
      keys.push(replacement)
      grants['key-2'] = [...(grants['key-1'] ?? [])]
      return Response.json({ ...replacement, secret: 'qgk_replacement_new456' }, { status: 201 })
    }
    return Response.json({ message: 'Not found' }, { status: 404 })
  })
  return { requests }
}

describe('user-owned API keys', () => {
  it('requires an explicit, clearly marked purpose before continuing', async () => {
    mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    const qbo = screen.getByRole('button', { name: /Work with QuickBooks data/ })
    const entities = screen.getByRole('button', { name: /Administer QBO Gateway entities/ })
    expect(qbo).toHaveAttribute('aria-pressed', 'false')
    expect(entities).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Continue to key details' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Reset API key setup' })).not.toBeInTheDocument()
    expect(screen.getByText('Each key has one purpose. Choose what this key needs to do.')).toBeInTheDocument()
    expect(entities).toHaveTextContent('Does not allow reading or changing their QuickBooks records.')
    fireEvent.click(entities)
    expect(entities).toHaveAttribute('aria-pressed', 'true')
    expect(entities).not.toHaveTextContent('Selected')
    expect(qbo).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Continue to key details' })).toBeEnabled()
  })

  it('skips purpose selection without Manage entities permission', async () => {
    mockKeyApi([], {}, [{ operation: 'qbo.entity.read', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/access/me')
      ? Response.json({ user: { id: 'user-1', role: 'Viewer', status: 'active' }, effective_grants: [{ operation: 'qbo.entity.read', client_id: null, environment: null }] })
      : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    expect(screen.getByRole('textbox', { name: 'Key name' })).toBeInTheDocument()
    expect(screen.getByText('Work with QuickBooks data')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'API key setup steps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Administer QBO Gateway entities/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to key type' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close API key setup' }))
    expect(screen.queryByText('Discard this API key?')).not.toBeInTheDocument()
  })

  it('keeps all-entity key access global when the owner can reach future entities', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'client.read', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('entities')
    expect(await screen.findByRole('button', { name: /All accessible entities.*Current and future/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /All accessible entities/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Entity automation' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    const issued = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issued?.init?.body))).toMatchObject({ purpose: 'entities', grants: expect.arrayContaining([
      { operation: 'client.read', client_id: null, environment: null },
    ]) })
    expect(screen.queryByRole('button', { name: 'Manage entities' })).not.toBeInTheDocument()
  })

  it('loads entity choices for QBO Read without a separate legacy View grant', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    expect(await screen.findByText('2 available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toBeInTheDocument()
    expect(requests.some((request) => request.path.endsWith('/clients'))).toBe(true)
  })

  it('keeps the selected-entity draft when an entity key visits all accessible entities', async () => {
    mockKeyApi([], {}, [
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'client.read', client_id: 'client-2', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('entities')
    const selectedTab = screen.getByRole('button', { name: 'Selected entities' })
    const allTab = screen.getByRole('button', { name: /All accessible entities/ })
    expect(selectedTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(selectedTab)
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select Northwind' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(allTab)
    fireEvent.click(selectedTab)
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select Northwind' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('keeps the selected-entity draft when a QBO key visits all entities', async () => {
    mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    const selectedTab = screen.getByRole('button', { name: 'Selected entities' })
    const allTab = screen.getByRole('button', { name: /All entities.*Current and future/ })
    expect(selectedTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(selectedTab)
    fireEvent.click(screen.getByRole('button', { name: 'Select Northwind' }))
    expect(screen.getByRole('button', { name: 'Select Northwind' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(allTab)
    fireEvent.click(selectedTab)
    expect(screen.getByRole('button', { name: 'Select Northwind' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('offers selected and all-current scope for a QBO key without global grants', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-2', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    const selectedTab = screen.getByRole('button', { name: 'Selected entities' })
    const allTab = screen.getByRole('button', { name: /All available entities/ })
    expect(selectedTab).toHaveAttribute('aria-pressed', 'true')
    expect(selectedTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    fireEvent.click(allTab)
    expect(screen.getByLabelText('Key setup summary')).toHaveTextContent('2 current available entities')
    expect(screen.getByText('Future entities are not included.', { exact: false })).toBeInTheDocument()
    const editAll = screen.getByRole('button', { name: 'Edit' })
    fireEvent.click(editAll)
    expect(editAll).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(selectedTab)
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select Northwind' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(allTab)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'All current QBO entities' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    const issued = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issued?.init?.body)).grants).toEqual(expect.arrayContaining([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-2', environment: null },
    ]))
    expect(JSON.parse(String(issued?.init?.body)).grants).toHaveLength(4)
  })

  it('offers all-current Edit only when every available entity permits it', async () => {
    mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    fireEvent.click(screen.getByRole('button', { name: /All available entities/ }))
    expect(within(screen.getByRole('group', { name: 'All available entities QBO access level' })).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    expect(screen.getByRole('group', { name: 'QuickBooks access for ACME Sandbox' })).toHaveTextContent('Edit')
  })

  it('blocks a duplicate active name and allows a distinct one', async () => {
    const existing = { id: 'existing-key', owner_user_id: 'user-1', name: 'Airflow', secret_suffix: 'old123', status: 'active', created_at: '2026-11-17T00:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, replaces_key_id: null }
    const { requests } = mockKeyApi([existing])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: '  AIRFLOW  ' } })
    expect(screen.getByRole('textbox', { name: 'Key name' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/An active key already uses this name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Airflow reporting' } })
    expect(screen.getByRole('button', { name: 'Create key' })).toBeEnabled()
  })

  it('shows a late duplicate-name conflict beside the field without claiming issuance is uncertain', async () => {
    mockKeyApi()
    const originalFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) =>
      String(input).endsWith('/access/keys') && init?.method === 'POST'
        ? Response.json({ message: 'An active API key with this name already exists' }, { status: 409 })
        : originalFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'New integration' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    expect(screen.getByText(/An active key already uses this name/)).toBeInTheDocument()
    expect(screen.queryByText(/Could not confirm issuance/)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
  })

  it('derives QuickBooks connection access without offering a separate key grant', async () => {
    const { requests } = mockKeyApi()
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/clients')
      ? Response.json([{ id: 'client-1', name: 'ACME Sandbox', environments: ['sandbox'] }, { id: 'client-2', name: 'Northwind', environments: ['prod'] }])
      : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    expect(screen.getByRole('region', { name: 'Key permissions' })).not.toHaveTextContent('QuickBooks connections')
    expect(within(screen.getByRole('region', { name: 'Key permissions' })).getAllByText('Entity scope')).toHaveLength(1)
    expect(screen.queryByText('Access for this key')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'QBO setup' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body))).toMatchObject({ purpose: 'entities', grants: [
      { operation: 'client.read', client_id: 'client-1', environment: null },
    ] })
  })

  it('creates a scoped key and reveals its complete secret only until dismissed', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('0 of 10 active')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create API key' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create API key' })).toHaveClass('icon-first-action')
    expect(screen.getByRole('button', { name: 'Create API key' }).querySelector('.icon-first-label')).toHaveTextContent('Create API key')
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    fireEvent.click(screen.getByRole('button', { name: /Administer QBO Gateway entities/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to key details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    const createDialog = screen.getByRole('dialog', { name: 'Create API key' })
    expect(createDialog).toBeInTheDocument()
    expect(createDialog).toHaveClass('overflow-hidden')
    expect(createDialog.querySelector('[data-dialog-header]')).toHaveClass('shrink-0')
    expect(createDialog.querySelector('[data-dialog-body]')).toHaveClass('overflow-y-auto', 'min-h-0')
    expect(createDialog.querySelector('[data-dialog-footer]')).toHaveClass('shrink-0')
    expect(within(createDialog).getByRole('button', { name: 'Create key' })).toHaveClass('icon-first-action')
    expect(within(createDialog).getByRole('button', { name: 'Create key' }).querySelector('.icon-first-label')).toHaveTextContent('Create API key')
    expect(within(createDialog).getByRole('button', { name: 'Back to key type' })).toHaveClass('icon-first-action')
    expect(within(createDialog).getByRole('button', { name: 'Back to key type' }).querySelector('.icon-first-label')).toHaveTextContent('Back to purpose')
    expect(createDialog.querySelector('[data-key-purpose]')).toHaveTextContent('Administer QBO Gateway entities')
    expect(createDialog.querySelector('[data-dialog-body]')).not.toContainElement(createDialog.querySelector('[data-key-purpose]'))
    expect(within(createDialog).getByLabelText('Key setup summary')).toHaveTextContent('Expires')
    expect(screen.getByRole('region', { name: 'Key permissions' })).toHaveTextContent('ACME Sandbox')
    expect(screen.queryByText(/It can create new entities/)).not.toBeInTheDocument()
    fireEvent.focus(screen.getByRole('button', { name: 'About key access' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('It can create new entities; updating or deleting existing ones is limited to the entities selected below.')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Bills Automation' } })
    expect(screen.queryByRole('button', { name: 'Review access' })).not.toBeInTheDocument()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
    await reviewAndCreateKey()
    expect(screen.getByRole('dialog', { name: 'New API key secret' })).toBeInTheDocument()
    expect(await screen.findByTestId('new-key-secret')).toHaveTextContent('qgk_private_xyz123')
    expect(screen.getByText('Shown only once')).toBeInTheDocument()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy key' })))
    expect(writeText).toHaveBeenCalledWith('qgk_private_xyz123')
    expect(screen.getByText('Copied to clipboard.')).toBeInTheDocument()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(issuance?.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String), 'X-CSRF-Token': 'csrf' })
    expect(JSON.parse(String(issuance?.init?.body))).toMatchObject({ name: 'Bills Automation', purpose: 'entities', expires_at: null, grants: [
      { operation: 'client.read', client_id: 'client-1', environment: null },
    ] })
    expect(requests.filter((request) => request.path.endsWith('/access/grants') && request.init?.method === 'POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('qgk_private_xyz123')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('••••xyz123')).toBeInTheDocument()
  })

  it('shows a newly created key even when an earlier entity filter would hide it', async () => {
    const base = { owner_user_id: 'user-1', secret_suffix: null, status: 'active', created_at: '2026-11-17T00:00:00Z', last_used_at: null, expires_at: null, revoked_at: null, replaces_key_id: null }
    mockKeyApi([
      { ...base, id: 'northwind-1', name: 'Northwind first' },
      { ...base, id: 'northwind-2', name: 'Northwind second' },
    ], {
      'northwind-1': [{ operation: 'client.read', client_id: 'client-2', environment: null }],
      'northwind-2': [{ operation: 'client.read', client_id: 'client-2', environment: null }],
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(screen.getByRole('button', { name: 'Entity Any entity' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Northwind' }))
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 keys shown')

    await openCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'ACME new key' } })
    await reviewAndCreateKey()
    expect(await screen.findByRole('dialog', { name: 'New API key secret' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByRole('button', { name: 'View access for ACME new key (ending xyz123)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entity Any entity' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('API key created.')
  })

  it('starts without key permissions and adds one entity with a single click', async () => {
    const { requests } = mockKeyApi([], {}, [
      { id: 'grant-1', operation: 'client.read', client_id: 'client-1', environment: null },
      { id: 'grant-2', operation: 'connection.connect', client_id: 'client-1', environment: 'prod' },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    expect(screen.getByRole('region', { name: 'Key permissions' })).not.toHaveTextContent('QuickBooks connections')
    expect(screen.getByRole('button', { name: /All accessible entities/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Choose which entities this key may update or delete/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Bills Automation' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body)).grants).toEqual([
      { operation: 'client.read', client_id: 'client-1', environment: null },
    ])
    expect(requests.filter((request) => request.path.endsWith('/access/grants') && request.init?.method === 'POST')).toHaveLength(0)
  })

  it('opens entity selection directly and lets the user find one among 1000 entities', async () => {
    const entityCount = 1000
    const userGrants = Array.from({ length: entityCount }, (_, index) => ({ operation: 'client.read', client_id: `client-${index}`, environment: null }))
    const { requests } = mockKeyApi([], {}, userGrants)
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/clients')
      ? Response.json(Array.from({ length: entityCount }, (_, index) => ({ id: `client-${index}`, name: `Entity ${String(index).padStart(4, '0')}` })))
      : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    expect(screen.getByRole('button', { name: /All accessible entities/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /All accessible entities/ })).toBeInTheDocument()
    expect(await screen.findByText('1000 entities with access')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    expect(screen.getByText('1000 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    const entityActions = screen.getByRole('group', { name: 'Entity selection actions' })
    fireEvent.click(within(entityActions).getByRole('button', { name: 'Select all available' }))
    expect(screen.getByText('1000 selected')).toBeInTheDocument()
    expect(within(entityActions).getByRole('button', { name: 'Select all available' })).toBeDisabled()
    fireEvent.click(within(entityActions).getByRole('button', { name: 'Show selected' }))
    expect(within(entityActions).getByRole('button', { name: 'Show selected' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(entityActions).getByRole('button', { name: 'Show selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an entity' }), { target: { value: '0007' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Entity 0007' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Single entity worker' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body)).grants).toEqual([
      { operation: 'client.read', client_id: 'client-7', environment: null },
    ])
  }, 15000)

  it('allows only held actions for each selected entity', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    expect(within(screen.getByRole('group', { name: 'QuickBooks access for ACME Sandbox' })).getByText('Read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' }))
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /Permanently delete entities/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select Northwind' }))
    expect(screen.queryByRole('button', { name: 'Edit access for Northwind' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Two entities' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body)).grants).toEqual([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
    ])
  })

  it('selects 100 entities but edits and removes access per entity', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/clients')
      ? Response.json(Array.from({ length: 100 }, (_, index) => ({ id: `client-${index}`, name: `Entity ${String(index).padStart(3, '0')}` })))
      : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    const entityActions = screen.getByRole('group', { name: 'Entity selection actions' })
    fireEvent.click(within(entityActions).getByRole('button', { name: 'Select all available' }))
    expect(screen.getByText('100 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for Entity 000' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an entity' }), { target: { value: '099' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Entity 099' }))
    expect(screen.getByText('99 selected')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Bulk scoped worker' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    const grants = JSON.parse(String(issuance?.init?.body)).grants as { operation: string; client_id: string | null }[]
    expect(grants).toHaveLength(100)
    expect(grants.some((grant) => grant.client_id === 'client-99')).toBe(false)
    expect(grants.filter((grant) => grant.operation === 'qbo.entity.edit')).toHaveLength(1)
  })

  it('shows inherited access directly and excludes legacy Connect grants on issuance', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'connection.connect', client_id: 'client-1', environment: 'sandbox' },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    const summary = screen.getByRole('region', { name: 'Key permissions' })
    expect(summary).toHaveTextContent('All entities')
    expect(summary).not.toHaveTextContent('QuickBooks connections')
    expect(summary).toHaveTextContent('Selected entities')
    fireEvent.click(screen.getByRole('button', { name: /All entities.*Current and future/ }))
    expect(screen.getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    const issuedGrants = JSON.parse(String(issuance?.init?.body)).grants
    expect(issuedGrants).toEqual([{ operation: 'qbo.entity.read', client_id: null, environment: null }])
    expect(issuedGrants.some((grant: { operation: string }) => grant.operation === 'connection.connect')).toBe(false)
  })

  it('lets a global owner narrow a key to a mock entity without sending global grants', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const demoId = 'de000000-0000-4000-8000-000000000011'
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/clients')) return Response.json([
        { id: 'client-1', name: 'ACME Sandbox' },
        ...Array.from({ length: 12 }, (_, index) => ({ id: `de000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: index === 10 ? 'Demo · Reporting Office' : `Demo · Entity ${index + 1}`, source: 'demo' })),
      ])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    const selectedScope = screen.getByRole('button', { name: 'Selected entities' })
    const allScope = screen.getByRole('button', { name: /All entities.*Current and future/ })
    expect(selectedScope.compareDocumentPosition(allScope) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await screen.findByRole('button', { name: /All entities.*Current and future/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select Demo · Reporting Office' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an entity' }), { target: { value: 'Reporting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Demo · Reporting Office' }))
    expect(screen.getByRole('button', { name: 'Select Demo · Reporting Office' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'QuickBooks access for Demo · Reporting Office' })).getByText('Read')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Reporting worker' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body)).grants).toEqual([{ operation: 'qbo.entity.read', client_id: demoId, environment: null }])
  })

  it('offers expiry presets and an in-product calendar only for a custom date', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    expect(screen.queryByLabelText('Expires on')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No expiration' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Active until revoked|Dated keys: up to 120 days/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Key setup summary')).toHaveTextContent('Until revoked')
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Key setup summary')).not.toHaveTextContent('Until revoked')
    fireEvent.click(screen.getByRole('button', { name: 'Choose date' }))
    expect(screen.getByLabelText('Choose expiration date')).toBeInTheDocument()
    expect(screen.getByLabelText('Choose expiration date')).not.toHaveClass('absolute')
    const enabledDates = within(screen.getByLabelText('Choose expiration date')).getAllByRole('button').filter((button) => !button.hasAttribute('disabled') && /^\d+$/.test(button.textContent ?? ''))
    fireEvent.click(enabledDates[0])
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Scheduled integration' } })
    await reviewAndCreateKey()
    const issuance = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    expect(JSON.parse(String(issuance?.init?.body)).expires_at).not.toBeNull()
  })

  it('cancels the modal without issuing a key', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    const trigger = await screen.findByRole('button', { name: 'Create API key' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close API key setup' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
  })

  it('confirms discarding changed setup in the app and keeps untouched setup dismissible', async () => {
    const { requests } = mockKeyApi()
    const browserConfirm = vi.spyOn(window, 'confirm')
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close API key setup' }))
    expect(screen.queryByRole('dialog', { name: 'Discard this API key?' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    fireEvent.click(screen.getByRole('button', { name: /Administer QBO Gateway entities/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to key details' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close API key setup' }))
    expect(screen.getByRole('dialog', { name: 'Discard this API key?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Key name')).toHaveValue('Worker')
    fireEvent.click(screen.getByRole('button', { name: 'Close API key setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog', { name: 'Create API key' })).not.toBeInTheDocument()
    expect(browserConfirm).not.toHaveBeenCalled()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
  })

  it('resets the setup in place without discarding the modal or issuing a key', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Temporary worker' } })
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    fireEvent.click(screen.getByRole('button', { name: /All entities.*Current and future/ }))
    expect(screen.getByRole('button', { name: 'Read' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Back to key type' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset API key setup' }))
    expect(screen.getByRole('dialog', { name: 'Create API key' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Key name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Administer QBO Gateway entities/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Selected entities' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to key details' })).toBeDisabled()
    expect(requests.filter((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')).toHaveLength(0)
  })

  it('requires confirmation before immediately revoking a key', async () => {
    mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    await reviewAndCreateKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Worker, ending xyz123' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }))
    expect(screen.getByRole('dialog', { name: 'Revoke access' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Revoke access' })).toHaveTextContent('Worker (ending xyz123)')
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Revoke access' })).getByRole('button', { name: 'Revoke access' })))
    expect(await screen.findByText('Key revoked. Requests using it are now rejected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Key history (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Key history (1)' }))
    expect(screen.getByRole('dialog', { name: 'Key history' })).toHaveTextContent('Worker')
    expect(screen.getByRole('dialog', { name: 'Key history' })).toHaveTextContent('Revoked')
    fireEvent.click(screen.getByRole('dialog', { name: 'Key history' }))
    expect(screen.queryByRole('dialog', { name: 'Key history' })).not.toBeInTheDocument()
  }, 15000)

  it('rotates with a new issuance request and shows only the replacement secret', async () => {
    const { requests } = mockKeyApi()
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate()
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Worker' } })
    await reviewAndCreateKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Worker, ending xyz123' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace key' }))
    expect(screen.getByRole('dialog', { name: 'Replace key' })).toHaveTextContent('Worker (ending xyz123)')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create replacement' })))
    expect(await screen.findByTestId('new-key-secret')).toHaveTextContent('qgk_replacement_new456')
    const rotation = requests.find((request) => request.path.endsWith('/rotate'))
    expect(rotation?.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) })
    expect(screen.getByText('••••new456')).toBeInTheDocument()
    expect(screen.queryByText('qgk_private_xyz123')).not.toBeInTheDocument()
  })

  it('shows legacy mixed keys without rotating them and guides the user to separate keys', async () => {
    const legacy = { id: 'legacy', owner_user_id: 'user-1', name: 'Old integration', secret_suffix: 'old123', status: 'active', created_at: '2026-11-17T00:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, replaces_key_id: null }
    const { requests } = mockKeyApi([legacy], { legacy: [
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
    ] })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(screen.getByText('Legacy mixed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Old integration, ending old123' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace key' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Legacy mixed keys cannot be replaced as one key. Create separate QBO and entity operation keys')
    expect(requests.some((request) => request.path.endsWith('/rotate'))).toBe(false)
  })

  it('separates active keys from history and groups expiry notices', async () => {
    const soon = new Date(Date.now() + 6 * 86_400_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const base = { owner_user_id: 'user-1', name: 'Test', created_at: '2026-11-17T00:00:00Z', last_used_at: null, replaces_key_id: null }
    mockKeyApi([
      { ...base, id: 'active-1', name: 'Soon one', secret_suffix: 'abc123', status: 'active', expires_at: soon, revoked_at: null },
      { ...base, id: 'active-2', name: 'Soon two', secret_suffix: 'def456', status: 'active', expires_at: soon, revoked_at: null },
      { ...base, id: 'expired', name: 'Old expiry', secret_suffix: 'ghi789', status: 'active', expires_at: past, revoked_at: null },
      { ...base, id: 'revoked', name: 'Old revoked', secret_suffix: 'jkl012', status: 'revoked', expires_at: null, revoked_at: past },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Your API keys' })).toBeInTheDocument()
    expect(screen.getAllByText('My API keys')).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'API keys' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/Soon one/)).toBeInTheDocument()
    expect(screen.getByText(/Soon two/)).toBeInTheDocument()
    expect(screen.queryByText('Old expiry')).not.toBeInTheDocument()
    expect(screen.queryByText('Old revoked')).not.toBeInTheDocument()
    expect(screen.getAllByText('No access')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /2 keys expire within 30 days/ }))
    expect(screen.getByRole('dialog', { name: 'Keys expiring soon' })).toHaveTextContent('Soon one')
    expect(screen.getByRole('dialog', { name: 'Keys expiring soon' })).toHaveTextContent('Soon two')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Key history (2)' }))
    expect(screen.getByRole('dialog', { name: 'Key history' })).toHaveTextContent('Old expiry')
    expect(screen.getByRole('dialog', { name: 'Key history' })).toHaveTextContent('Old revoked')
  })

  it('shows suspended keys as unusable and keeps existing permissions read-only', async () => {
    const base = { owner_user_id: 'user-1', created_at: '2026-11-17T00:00:00Z', last_used_at: null, replaces_key_id: null, expires_at: null, revoked_at: null }
    mockKeyApi([
      { ...base, id: 'suspended', name: 'Suspended integration', secret_suffix: 'susp123', status: 'suspended' },
      { ...base, id: 'active', name: 'Active integration', secret_suffix: 'active1', status: 'active' },
    ], {
      active: [{ id: 'g1', operation: 'client.read', client_id: 'client-1', environment: null }],
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(screen.getByRole('button', { name: 'Key history (1)' }))
    expect(await screen.findByText(/Inactive keys are retained for up to 7 days/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Key history' })).toHaveTextContent('Suspended')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('1 entity')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'API keys' })).queryByText('Never')).not.toBeInTheDocument()
    const viewAccess = screen.getByRole('button', { name: 'View access for Active integration (ending active1)' })
    viewAccess.focus()
    fireEvent.click(viewAccess)
    const detail = await screen.findByRole('dialog', { name: 'Access for Active integration' })
    expect(within(detail).getByRole('region', { name: 'Specific entity access' })).toHaveTextContent('ACME Sandbox')
    expect(detail).toHaveTextContent('Entity details only')
    expect(detail).toHaveTextContent('Does not expire')
    expect(detail).toHaveTextContent('Last used')
    fireEvent.click(within(detail).getByRole('button', { name: 'Close key access' }))
    expect(screen.getByRole('button', { name: 'View access for Active integration (ending active1)' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Actions for Active integration, ending active1' })).toHaveTextContent('Manage')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Active integration, ending active1' }))
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Add permission/ })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Replace key' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Active integration, ending active1' })).toHaveFocus()
  })

  it('refreshes key permissions before opening detail after an external downgrade', async () => {
    mockKeyApi([{
      id: 'key-1', owner_user_id: 'user-1', name: 'Airflow', secret_suffix: 'abc123',
      status: 'active', created_at: '2026-11-17T00:00:00Z', last_used_at: null,
      expires_at: null, revoked_at: null, replaces_key_id: null,
    }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    let grantReads = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/access/grants?api_key_id=key-1')) {
        grantReads += 1
        return Response.json([
          { operation: 'client.read', client_id: 'client-1', environment: null },
          ...(grantReads === 1 ? [{ operation: 'qbo.entity.edit', client_id: 'client-1', environment: null }] : []),
        ])
      }
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    fireEvent.click(screen.getByRole('button', { name: 'View access for Airflow (ending abc123)' }))
    const detail = await screen.findByRole('dialog', { name: 'Access for Airflow' })
    expect(grantReads).toBe(2)
    expect(detail).toHaveTextContent('Entity details only')
    expect(detail).not.toHaveTextContent('Edit QuickBooks data for entity')
  })

  it('filters keys by entity without an action filter or duplicate rows', async () => {
    const base = { owner_user_id: 'user-1', secret_suffix: null, status: 'active', created_at: '2026-11-17T00:00:00Z', last_used_at: null, expires_at: null, revoked_at: null, replaces_key_id: null }
    mockKeyApi([
      { ...base, id: 'acme-read', name: 'ACME reader' },
      { ...base, id: 'northwind-edit', name: 'Northwind editor' },
      { ...base, id: 'mixed', name: 'Split scope' },
      { ...base, id: 'global-read', name: 'Global reader' },
      { ...base, id: 'acme-edit', name: 'ACME editor' },
    ], {
      'acme-read': [{ operation: 'client.read', client_id: 'client-1', environment: null }],
      'northwind-edit': [{ operation: 'qbo.entity.edit', client_id: 'client-2', environment: null }],
      mixed: [{ operation: 'client.read', client_id: 'client-1', environment: null }, { operation: 'qbo.entity.edit', client_id: 'client-2', environment: null }],
      'global-read': [{ operation: 'client.read', client_id: null, environment: null }],
      'acme-edit': [{ operation: 'qbo.entity.edit', client_id: 'client-1', environment: null }],
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(within(screen.getByRole('region', { name: 'API keys' })).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Entity Any entity' }))
    fireEvent.click(await screen.findByRole('option', { name: 'ACME Sandbox' }))
    expect(screen.getByRole('status')).toHaveTextContent('4 of 5 keys shown')
    expect(screen.queryByRole('button', { name: /Action Any action/ })).not.toBeInTheDocument()
    expect(screen.getByText('ACME editor')).toBeInTheDocument()
    expect(screen.getByText('Split scope')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('region', { name: 'API keys' })).getAllByRole('listitem')).toHaveLength(5)
    const splitScope = screen.getByRole('button', { name: 'View access for Split scope' }).closest('li') as HTMLElement
    expect(within(splitScope).getByText('2 entities')).toBeInTheDocument()
    expect(within(splitScope).queryByText('ACME Sandbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/more scopes/)).not.toBeInTheDocument()
    fireEvent.click(within(splitScope).getByRole('button', { name: 'View access for Split scope' }))
    const detail = await screen.findByRole('dialog', { name: 'Access for Split scope' })
    expect(within(detail).getByRole('region', { name: 'Specific entity access' })).toHaveTextContent('ACME Sandbox')
    expect(detail).toHaveTextContent('Northwind')
    expect(detail).toHaveTextContent('Entity details only')
    expect(detail).toHaveTextContent('Edit (legacy; no Read)')
  })

  it('keeps creation capped at ten while replacement remains available', async () => {
    const base = { owner_user_id: 'user-1', secret_suffix: null, status: 'active', created_at: '2026-11-17T00:00:00Z', last_used_at: null, expires_at: null, revoked_at: null, replaces_key_id: null }
    mockKeyApi(Array.from({ length: 10 }, (_, index) => ({ ...base, id: `key-${index}`, name: `Worker ${index + 1}` })))
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('10 of 10 active')).toBeInTheDocument()
    expect(screen.getByText('10-key limit reached. Replace an existing key or revoke one you no longer use.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create API key' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Worker 1' }))
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeEnabled()
  })

  it('does not offer Delete when creating an all-entity key', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
      { operation: 'qbo.entity.delete', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    fireEvent.click(await screen.findByRole('button', { name: /All entities/ }))
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Edit capable' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    const createRequest = requests.find((request) => request.path.endsWith('/access/keys') && request.init?.method === 'POST')
    const grants = JSON.parse(String(createRequest?.init?.body)).grants as Array<{ operation: string }>
    expect(grants.some((grant) => grant.operation === 'qbo.entity.edit')).toBe(true)
    expect(grants.some((grant) => grant.operation === 'qbo.entity.delete')).toBe(false)
  })

  it('does not offer Delete when creating a selected-entity key', async () => {
    const { requests } = mockKeyApi([], {}, [
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
      { operation: 'qbo.entity.delete', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    await openCreate('qbo')
    expect(screen.getByText('Work with QuickBooks data')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All entities.*Current and future/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Selected entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select ACME Sandbox' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Northwind' }))
    expect(screen.queryByText(/Apply to 2 selected/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for Northwind' }))
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Key name' }), { target: { value: 'Scoped edit worker' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create key' })))
    const request = requests.find((entry) => entry.path.endsWith('/access/keys') && entry.init?.method === 'POST')
    const grants = JSON.parse(String(request?.init?.body)).grants as Array<{ operation: string; client_id: string }>
    expect(grants.filter((grant) => grant.operation === 'qbo.entity.edit')).toHaveLength(2)
    expect(grants.some((grant) => grant.operation === 'qbo.entity.delete')).toBe(false)
  })

  it('does not offer obsolete environment or last-use filters', async () => {
    const base = { owner_user_id: 'user-1', secret_suffix: null, status: 'active', created_at: '2026-11-17T00:00:00Z', expires_at: null, revoked_at: null, replaces_key_id: null }
    mockKeyApi([
      { ...base, id: 'broad', name: 'Broad reader', last_used_at: new Date().toISOString() },
      { ...base, id: 'sandbox', name: 'Sandbox connector', last_used_at: null },
      { ...base, id: 'production', name: 'Production connector', last_used_at: null },
    ], {
      broad: [{ operation: 'client.read', client_id: 'client-1', environment: null }],
      sandbox: [{ operation: 'connection.connect', client_id: 'client-1', environment: 'sandbox' }],
      production: [{ operation: 'connection.connect', client_id: 'client-1', environment: 'prod' }],
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/keys']}><AuthProvider><MyApiKeysPage /></AuthProvider></MemoryRouter>))
    expect(screen.queryByRole('button', { name: /Environment/ })).not.toBeInTheDocument()
    expect(screen.getByText('Broad reader')).toBeInTheDocument()
    expect(screen.getByText('Sandbox connector')).toBeInTheDocument()
    expect(screen.getByText('Production connector')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Last used Any time' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'API keys' })).queryByText('Last used')).not.toBeInTheDocument()
  })
})
