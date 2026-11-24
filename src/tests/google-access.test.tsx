import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { AccessHomePage } from '../modules/auth/AccessHomePage'
import { AccountNavigation } from '../modules/auth/AccountNavigation'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { ClientListPage } from '../modules/qbo/pages/ClientListPage'
import { ClientDetailPage } from '../modules/qbo/pages/ClientDetailPage'
import { ClientDetailRoute, ClientsRoute } from '../App'
import { CreateClientPage } from '../modules/qbo/pages/CreateClientPage'
import { RequireAdmin } from '../modules/auth/RequireAdmin'
import { AppLayout } from '../layout/AppLayout'
import { RequireClientRead } from '../modules/auth/RequireClientRead'
import { LoginPage } from '../modules/auth/LoginPage'
import { ActivityPage } from '../modules/activity/ActivityPage'
import { RequireActivityRead } from '../modules/auth/RequireActivityRead'
import { AccessAdministrationPage } from '../modules/auth/AccessAdministrationPage'
import { AccessUserDetailPage } from '../modules/auth/AccessUserDetailPage'
import { RequireUsersAdmin } from '../modules/auth/RequireUsersAdmin'

afterEach(() => vi.restoreAllMocks())

function mockGoogleSession(grants: object[], role = 'Admin') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input)
    if (path.endsWith('/access/session')) return new Response(JSON.stringify({
      user: { name: 'Jorge', email: 'jorge@example.test', issuer: 'https://accounts.google.com', sub: 'sub-1' }, csrf: 'csrf',
    }), { status: 200 })
    if (path.endsWith('/access/me')) return new Response(JSON.stringify({
      user: { id: 'user-1', role, status: 'active' }, effective_grants: grants,
    }), { status: 200 })
    if (path.endsWith('/access/activity/actors')) return new Response(JSON.stringify(['owner@example.test']), { status: 200 })
    if (path.includes('/access/activity')) return new Response(JSON.stringify({ items: [{
      id: 'evt-1', occurred_at: '2026-11-15T08:00:00Z', reference_id: 'req-1',
      actor: 'owner@example.test', key_name: 'Reporting', client_name: 'Allowed entity', target_name: 'Allowed entity',
      environment: 'prod', action: 'Viewed QuickBooks data for Allowed entity', category: 'read', status: 'completed',
    }], next_cursor: null, total_count: 1 }), { status: 200 })
    if (path.endsWith('/overview')) return new Response(JSON.stringify({
      activeClients: 1, clientGroups: 1, demo: false, connected: 1, disconnected: 0,
      notChecked: 0, unavailable: 0, noCredential: 0, disconnectedClients: [], partial: false,
    }), { status: 200 })
    if (path.includes('/access/clients/client-1/integrations')) return new Response(JSON.stringify({ can_view_others: true, items: [
      { key_id: 'key-1', name: 'Billing sync', secret_suffix: 'ABC123', owner_user_id: 'user-1', owner_name: 'Jorge', owner_email: 'jorge@example.test', expires_at: null, access: [{ operation: 'client.read', client_id: 'client-1', environment: null }] },
      { key_id: 'key-2', name: 'Reports', secret_suffix: 'DEF456', owner_user_id: 'user-2', owner_name: 'Ana', owner_email: 'ana@example.test', expires_at: null, access: [{ operation: 'client.read', client_id: 'client-1', environment: null }] },
    ] }), { status: 200 })
    if (path.includes('/clients/')) return new Response(JSON.stringify({ id: 'client-1', name: 'Allowed entity', status: 'active', client_group: 'group', environments: ['sandbox', 'prod'], connections: [] }), { status: 200 })
    if (path.includes('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'Allowed entity', status: 'active', client_group: 'group', connection_state: 'connected' }]), { status: 200 })
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
  })
}

describe('Google governed access', () => {
  it('shows the overview and assigned entities for an Operator with only QBO Read', async () => {
    mockGoogleSession([{ operation: 'qbo.entity.read', client_id: 'client-1', environment: null }], 'Operator')
    const requests: string[] = []
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      requests.push(String(input))
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/']}><AuthProvider><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="qbo/clients" element={<ClientsRoute />} />
      </Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('link', { name: /Entities 1/ })).toBeInTheDocument()
    expect(requests.some((path) => path.endsWith('/overview'))).toBe(true)
    expect(screen.queryByText(/Administrator access is required/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Entities 1/ }))
    expect(await screen.findByText('Allowed entity')).toBeInTheDocument()
  })

  it('opens the Create entity form for a Google Admin with global Manage entities', async () => {
    mockGoogleSession([{ id: 'manage-entities', operation: 'entities.manage', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients']}><AuthProvider><Routes>
      <Route path="/qbo/clients" element={<ClientsRoute />}>
        <Route element={<RequireAdmin />}><Route path="new" element={<CreateClientPage />} /></Route>
      </Route>
      <Route path="/" element={<p>Overview</p>} />
    </Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Create entity' }))
    expect(await screen.findByRole('dialog', { name: 'Create entity' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Entity name' })).toBeInTheDocument()
  })

  it('does not treat a legacy scoped Manage grant as permission to create', async () => {
    mockGoogleSession([{ id: 'manage-entities', operation: 'entities.manage', client_id: 'client-1', environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients']}><AuthProvider><Routes>
      <Route path="/qbo/clients" element={<ClientsRoute />}>
        <Route element={<RequireAdmin />}><Route path="new" element={<CreateClientPage />} /></Route>
      </Route>
      <Route path="/" element={<p>Overview</p>} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(screen.queryByRole('link', { name: 'Create entity' })).not.toBeInTheDocument()
  })

  it('does not allow the Create entity route without Manage entities', async () => {
    mockGoogleSession([{ id: 'view-entity', operation: 'client.read', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients/new']}><AuthProvider><Routes>
      <Route path="/qbo/clients" element={<ClientsRoute />}>
        <Route element={<RequireAdmin />}><Route path="new" element={<CreateClientPage />} /></Route>
      </Route>
      <Route path="/" element={<p>Overview</p>} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('Overview')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create entity' })).not.toBeInTheDocument()
  })

  it('separates QuickBooks actions from Gateway entity administration in the entity summary', async () => {
    mockGoogleSession([
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients/client-1']}><AuthProvider><Routes>
      <Route path="/qbo/clients/:clientId" element={<ClientDetailRoute />} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('Can read and edit QuickBooks data for this entity')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete entity' })).not.toBeInTheDocument()
  })

  it('offers Gateway entity deletion only with global Manage entities', async () => {
    mockGoogleSession([
      { operation: 'entities.manage', client_id: null, environment: null },
      { operation: 'client.read', client_id: 'client-1', environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients/client-1']}><AuthProvider><Routes>
      <Route path="/qbo/clients/:clientId" element={<ClientDetailRoute />} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('button', { name: 'Delete entity' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your access to this entity')).not.toHaveTextContent('delete')
  })

  it('shows permitted Activity and People on the overview and groups them in Administration', async () => {
    mockGoogleSession([
      { operation: 'client.read', client_id: null, environment: null },
      { operation: 'activity.read', client_id: null, environment: null },
      { operation: 'access.manage', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/access/users')
      ? Response.json([{ id: 'user-1', status: 'active', sub: 'owner' }, { id: 'user-2', status: 'active', sub: null }, { id: 'user-3', status: 'disabled', sub: 'paused' }]) : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/']}><AuthProvider><Routes>
      <Route element={<AppLayout />}><Route index element={<DashboardPage />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    const overview = screen.getByRole('region', { name: 'Administration overview' })
    expect(within(overview).getByRole('link', { name: /QBO transactions/ })).toHaveAttribute('href', '/access/activity')
    expect(within(overview).getByRole('link', { name: /People and access/ })).toHaveAttribute('href', '/access/users')
    expect(await within(overview).findByText('1 QBO transaction')).toBeInTheDocument()
    expect(within(overview).getByText(/Latest: Viewed QuickBooks data/)).toBeInTheDocument()
    expect(await within(overview).findByText('2 people managed')).toBeInTheDocument()
    expect(within(overview).getByText('1 awaiting first sign-in · 1 paused')).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    const administration = within(sidebar).getByText('Administration')
    const people = within(sidebar).getByRole('link', { name: 'People and access' })
    const activity = within(sidebar).getByRole('link', { name: 'Activity' })
    expect(administration.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(people.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('summarizes All entities access and lists effective access before filtering', async () => {
    mockGoogleSession([
      { operation: 'client.read', client_id: null, environment: null },
      { operation: 'entities.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'connection.connect', client_id: 'client-1', environment: 'sandbox' },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/clients')) return Response.json([
        { id: 'client-1', name: 'ACME Sandbox', status: 'active', environments: ['sandbox'] },
        ...Array.from({ length: 12 }, (_, index) => ({ id: `demo-${index}`, name: `Demo · Entity ${index + 1}`, status: 'active', source: 'demo' })),
      ])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access']}><AuthProvider><Routes><Route path="/access" element={<AccessHomePage />} /></Routes></AuthProvider></MemoryRouter>))
    const entityAccess = screen.getByRole('region', { name: 'Entity access' })
    expect(await within(entityAccess).findByText('13 current')).toBeInTheDocument()
    expect(within(entityAccess).getAllByText('Read QBO').length).toBeGreaterThan(0)
    expect(within(entityAccess).getAllByText('Edit QBO', { exact: false }).length).toBeGreaterThan(0)
    expect(within(entityAccess).queryByText('Manage entities')).not.toBeInTheDocument()
    const consoleAccess = screen.getByRole('region', { name: 'Administration access' })
    expect(within(consoleAccess).getAllByText('Manage entities')).toHaveLength(1)
    expect(consoleAccess).toHaveTextContent('Create anywhere · Edit/delete: all assigned entities')
    fireEvent.click(within(entityAccess).getByText('Entities and effective access'))
    const effectiveList = within(entityAccess).getByRole('list', { name: 'Effective entity access' })
    expect(within(effectiveList).getAllByRole('listitem')).toHaveLength(13)
    expect(within(effectiveList).getByText('Demo · Entity 12')).toBeInTheDocument()
    expect(within(effectiveList).getByText('ACME Sandbox').closest('li')).toHaveTextContent('Read QBO')
    expect(within(effectiveList).getByText('ACME Sandbox').closest('li')).toHaveTextContent('Edit QBO')
    fireEvent.change(within(entityAccess).getByRole('searchbox', { name: 'Filter entities' }), { target: { value: 'Entity 12' } })
    expect(within(effectiveList).getAllByRole('listitem')).toHaveLength(1)
    expect(within(entityAccess).getAllByText('ACME Sandbox')).toHaveLength(1)
    expect(within(entityAccess).getByText('Demo · Entity 12')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'QuickBooks connections' })).not.toBeInTheDocument()
  })

  it('navigates between account tabs while an expanded sidebar closes', async () => {
    mockGoogleSession([])
    await act(async () => render(<MemoryRouter initialEntries={['/access']}><AuthProvider><Routes>
      <Route element={<AppLayout />}>
        <Route path="/access" element={<><AccountNavigation /><h1>Access page</h1></>} />
        <Route path="/access/keys" element={<><AccountNavigation /><h1>Keys page</h1></>} />
      </Route>
    </Routes></AuthProvider></MemoryRouter>))
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    const pinSidebar = () => fireEvent.click(sidebar.firstElementChild as Element)
    pinSidebar()
    expect(sidebar).toHaveClass('w-64')
    const keysLink = within(screen.getByRole('navigation', { name: 'Account navigation' })).getByRole('link', { name: 'My API keys' })
    fireEvent.pointerDown(keysLink)
    expect(sidebar).toHaveClass('w-64')
    fireEvent.click(keysLink)
    expect(await screen.findByRole('heading', { name: 'Keys page' })).toBeInTheDocument()
    expect(sidebar).toHaveClass('w-20')

    pinSidebar()
    const accessLink = within(screen.getByRole('navigation', { name: 'Account navigation' })).getByRole('link', { name: 'My access' })
    fireEvent.pointerDown(accessLink)
    expect(sidebar).toHaveClass('w-64')
    fireEvent.click(accessLink)
    expect(await screen.findByRole('heading', { name: 'Access page' })).toBeInTheDocument()
    expect(sidebar).toHaveClass('w-20')
  })

  it('shows a concise Activity summary and reference only with the explicit global Admin grant', async () => {
    mockGoogleSession([{ id: 'grant-activity', operation: 'activity.read', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/access/activity']}><AuthProvider><Routes>
      <Route element={<AppLayout />}>
        <Route path="/access" element={<AccessHomePage />} />
        <Route element={<RequireActivityRead />}><Route path="/access/activity" element={<ActivityPage />} /></Route>
      </Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.queryByText('Completed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Operation / })).toBeInTheDocument()
    expect(screen.getByText('Using API key Reporting')).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByText('viewed QuickBooks data for Allowed entity')).toBeInTheDocument()
    expect(screen.queryByText('api_key_id')).not.toBeInTheDocument()
    expect(screen.queryByText('qbo.account.read')).not.toBeInTheDocument()
    expect(screen.queryByText('503')).not.toBeInTheDocument()
    expect(screen.queryByText('Copy reference ID')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy reference ID/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Support reference' }))
    expect(screen.getByRole('dialog', { name: 'Support reference' })).toHaveTextContent('req-1')
    expect(screen.getByRole('dialog', { name: 'Support reference' })).toHaveClass('reference-popover-below')
    expect(screen.getByLabelText('Activity history')).not.toHaveClass('overflow-hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Support reference' })).not.toBeInTheDocument()
    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(mainNav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(within(mainNav).queryByRole('link', { name: 'My access' })).not.toBeInTheDocument()
    const accountButton = screen.getAllByRole('button', { name: 'Account options' })[0]
    expect(accountButton).toHaveTextContent('Jorge')
    expect(accountButton).toHaveTextContent('Admin')
    fireEvent.mouseEnter(accountButton)
    expect(screen.getByText('jorge@example.test', { selector: '[role="tooltip"]' })).toBeInTheDocument()
    expect(accountButton).toHaveAttribute('aria-describedby')
    fireEvent.mouseLeave(accountButton)
    expect(screen.queryByText('jorge@example.test', { selector: '[role="tooltip"]' })).not.toBeInTheDocument()
    fireEvent.click(accountButton)
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/access')
    expect(screen.queryByRole('link', { name: 'My API keys' })).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/access/activity/summary?limit=25&scope=qbo_transactions&page=1'), expect.anything())
    expect(within(screen.getByRole('group', { name: 'Activity view' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['All activity', 'QBO transactions'])
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'All activity' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('scope=completed'), expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /^Person / }))
    expect(screen.queryByRole('option', { name: 'Anyone' })).not.toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'owner@example.test' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('scope=completed&page=1&actor_email=owner%40example.test'), expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /^When / }))
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Last 7 days' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('from_at='), expect.anything())
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).toBe('/automations/api/access/activity/summary?limit=25&scope=completed&page=1')
    fireEvent.click(screen.getByRole('button', { name: /^Operation / }))
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Deleted' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('category=delete'), expect.anything())
  }, 15000)

  it('does not request Activity for a Google user without activity.read', async () => {
    mockGoogleSession([{ id: 'grant-1', operation: 'client.read', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/access/activity']}><AuthProvider><Routes>
      <Route path="/access" element={<AccessHomePage />} />
      <Route element={<RequireActivityRead />}><Route path="/access/activity" element={<ActivityPage />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/access/activity'), expect.anything())
  })

  it('keeps the original overview and client pages for a Google session without write controls', async () => {
    mockGoogleSession([{ id: 'grant-1', operation: 'client.read', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/']}><AuthProvider><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/access" element={<AccessHomePage />} />
        <Route element={<RequireClientRead />}>
          <Route path="/qbo/clients" element={<ClientListPage readOnly />} />
          <Route path="/qbo/clients/:clientId" element={<ClientDetailPage readOnly />} />
        </Route>
      </Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'FinOps Console' })).toBeInTheDocument()
    expect(screen.getByText('Connected QuickBooks connections')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/overview', expect.anything())
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Clients & Integrations' }))
    expect(await screen.findByText('Allowed entity')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create entity' })).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/clients?connection_status=1', expect.anything())
    fireEvent.click(screen.getByRole('link', { name: 'Allowed entity' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Allowed entity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate entity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete entity' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reconnect QuickBooks')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your access to this entity')).toHaveTextContent('Can view this entity in FinOps')
    expect(await screen.findByText('Billing sync')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mine' }))
    expect(screen.getByText('Billing sync')).toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
  })

  it('offers QuickBooks connection for the assigned entity in its configured environments', async () => {
    mockGoogleSession([
      { id: 'read', operation: 'client.read', client_id: 'client-1', environment: null },
      { id: 'update', operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { id: 'create', operation: 'entities.manage', client_id: null, environment: null },
      { id: 'connect', operation: 'connection.connect', client_id: 'client-1', environment: 'sandbox' },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients/client-1']}><AuthProvider><Routes>
      <Route path="/qbo/clients/:clientId" element={<ClientDetailRoute />} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Allowed entity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit entity name and group' })).not.toBeInTheDocument()
    const access = screen.getByLabelText('Your access to this entity')
    expect(within(access).getByText('Can edit QuickBooks data for this entity')).toBeInTheDocument()
    expect(within(access).queryByText('Connect QuickBooks in Sandbox')).not.toBeInTheDocument()
    expect(within(access).queryByText('Create entities')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Connect QuickBooks', { selector: 'summary' }))
    expect(screen.getByRole('button', { name: 'Connect sandbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect prod' })).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.queryByText('Your keys')).not.toBeInTheDocument()
    expect(screen.queryByText('Team keys')).not.toBeInTheDocument()
  })

  it('does not load clients without a client.read grant, even for an Admin', async () => {
    mockGoogleSession([{ id: 'grant-1', operation: 'access.manage', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients']}><AuthProvider><Routes>
      <Route path="/" element={<AccessHomePage />} />
      <Route element={<RequireClientRead />}><Route path="/qbo/clients" element={<ClientListPage readOnly />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage access')
    expect(screen.queryByText('access.manage')).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/clients'), expect.anything())
  })

  it('lets an Admin configure a person before creating the account and grants together', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'entities-grant', operation: 'entities.manage', client_id: null, environment: null },
      { id: 'activity-grant', operation: 'activity.read', client_id: null, environment: null },
      { id: 'keys-grant', operation: 'keys.admin', client_id: null, environment: null },
      { id: 'client-grant', operation: 'client.read', client_id: null, environment: null },
      { id: 'qbo-read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'qbo-edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    let approved = false
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users') && init?.method === 'POST') {
        approved = true
        return new Response(JSON.stringify({ id: 'new-user', email: 'ana@example.test', display_name: null, role: 'Operator', status: 'active', issuer: null, sub: null }), { status: 201 })
      }
      if (path.endsWith('/access/users')) return new Response(JSON.stringify(approved ? [
        { id: 'new-user', email: 'ana@example.test', display_name: null, role: 'Operator', status: 'active', issuer: null, sub: null },
      ] : []), { status: 200 })
      if (path.endsWith('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'Allowed entity', environments: ['sandbox'] }, { id: 'client-2', name: 'Second entity', environments: ['prod'] }]), { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes>
      <Route element={<AppLayout />}><Route element={<RequireUsersAdmin />}>
        <Route path="/access/users" element={<AccessAdministrationPage />} />
        <Route path="/access/users/:userId" element={<AccessUserDetailPage />} />
      </Route></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'People and access' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    const emailInput = await screen.findByPlaceholderText('name@company.com')
    const addDialog = screen.getByRole('dialog', { name: 'Add person' })
    expect(within(addDialog).getByRole('button', { name: 'Cancel' })).toHaveClass('absolute')
    expect(within(addDialog).queryByRole('group', { name: 'Sign-in status' })).not.toBeInTheDocument()
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    const accessStep = within(addDialog).getByRole('button', { name: '2 · Access' })
    expect(accessStep).toBeDisabled()
    expect(within(addDialog).getByRole('button', { name: 'Continue to access' })).toBeDisabled()
    fireEvent.click(accessStep)
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    fireEvent.change(emailInput, { target: { value: 'invalid' } })
    expect(accessStep).toBeDisabled()
    fireEvent.change(emailInput, { target: { value: 'ana@example.test' } })
    expect(accessStep).toBeEnabled()
    expect(accessStep).not.toHaveAttribute('aria-current')
    expect(within(addDialog).getByRole('button', { name: /^Viewer/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(addDialog).getByRole('button', { name: /^Admin/ }))
    expect(within(addDialog).queryByText(/Manage entities also allows this person/)).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Continue to access' }))
    await within(addDialog).findByRole('button', { name: /All entities/ })
    fireEvent.click(within(addDialog).getByRole('button', { name: /All entities/ }))
    const administration = within(addDialog).getByRole('group', { name: 'Console administration' })
    expect(within(administration).getByRole('button', { name: 'Manage access' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(administration).queryByRole('button', { name: 'Manage entities in FinOps' })).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('group', { name: 'Entity management' })).not.toBeInTheDocument()
    expect(within(administration).getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(administration).getByRole('button', { name: 'Administer API keys' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(addDialog).queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('button', { name: 'Read QuickBooks data for entity' })).not.toBeInTheDocument()
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).toHaveTextContent('Read QBO is preselected')
    expect(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(administration).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Back' }))
    fireEvent.click(within(addDialog).getByRole('button', { name: /^Operator/ }))
    expect(within(addDialog).getByRole('button', { name: /^Operator/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(addDialog).getByText(/QBO connection is included for assigned entities in configured environments/)).toBeInTheDocument()
    expect(within(addDialog).queryByText(/Admin suggestions include/)).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/automations/api/access/users', expect.objectContaining({ method: 'POST' }))
    expect(within(addDialog).getByRole('button', { name: 'Cancel' })).toHaveClass('icon-first-action')
    expect(within(addDialog).getByRole('button', { name: 'Continue to access' })).toHaveClass('icon-first-action')
    expect(screen.getByRole('button', { name: 'Continue to access' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to access' }))
    await waitFor(() => expect(within(addDialog).getByRole('button', { name: '2 · Access' })).toHaveAttribute('aria-current', 'step'))
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: /Selected entities/ }))
    expect(within(addDialog).getByRole('button', { name: 'Back' })).toHaveClass('icon-first-action')
    expect(within(addDialog).getByRole('button', { name: 'Review person' })).toHaveClass('icon-first-action')
    expect(screen.getByRole('button', { name: 'Review person' })).toBeDisabled()
    fireEvent.click(await screen.findByRole('button', { name: 'Allowed entity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Second entity' }))
    expect(within(addDialog).getByRole('group', { name: 'Select entities' }).querySelector('input[type="checkbox"]')).toBeNull()
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).toHaveTextContent('Read')
    expect(within(addDialog).queryByText(/No separate person permission is needed/)).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('group', { name: 'Console administration' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 entities · 4 permissions')).toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Back' }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'invalid' } })
    expect(within(addDialog).getByRole('button', { name: '2 · Access' })).toBeDisabled()
    expect(within(addDialog).getByRole('button', { name: 'Continue to access' })).toBeDisabled()
    fireEvent.click(within(addDialog).getByRole('button', { name: '2 · Access' }))
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'ana@example.test' } })
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Continue to access' }))
    await waitFor(() => expect(within(addDialog).getByRole('button', { name: '2 · Access' })).toHaveAttribute('aria-current', 'step'))
    expect(within(addDialog).queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review person' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('ana@example.test')
    expect(review).toHaveTextContent('Allowed entity')
    expect(review).toHaveTextContent('Second entity')
    expect(review).toHaveTextContent('+ Read')
    expect(review).toHaveTextContent('+ Edit')
    expect(within(review).queryByRole('region', { name: 'API key impact' })).not.toBeInTheDocument()
    expect(within(review).queryByText('Sign-in')).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add person' }))
    await screen.findByText('Person added with the selected access.')
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/access/users', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'ana@example.test', role: 'Operator', status: 'active', grants: [{ operation: 'qbo.entity.read', client_id: 'client-1', environment: null }, { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null }, { operation: 'qbo.entity.read', client_id: 'client-2', environment: null }, { operation: 'qbo.entity.edit', client_id: 'client-2', environment: null }], is_super_admin: false }),
    }))
  }, 15000)

  it('checks an existing email before allowing access setup', async () => {
    mockGoogleSession([{ id: 'users-grant', operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/users')) {
        expect(init?.method).not.toBe('POST')
        return Response.json([{ id: 'person-1', email: 'existing@example.test', display_name: null, role: 'Operator', status: 'active', issuer: null, sub: null }])
      }
      if (String(input).endsWith('/clients')) return Response.json([])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add person' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Google email' }), { target: { value: 'Existing@Example.Test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to access' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already belongs to a person')
    expect(within(dialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    expect(within(dialog).getByRole('textbox', { name: 'Google email' })).toHaveAttribute('aria-invalid', 'true')
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/automations/api/access/users', expect.objectContaining({ method: 'POST' }))
  })

  it('summarizes edit impact by entity and returns to the existing editor', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'qbo-edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
      { id: 'client-grant', operation: 'client.read', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return new Response(JSON.stringify([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null }]), { status: 200 })
      if (path.endsWith('/access/grants?user_id=user-2')) return new Response(JSON.stringify([{ operation: 'client.read', client_id: 'client-1', environment: null }]), { status: 200 })
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return new Response(JSON.stringify({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [], changes: ['Add 1 permission(s)'] }), { status: 200 })
      if (path.endsWith('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'ACME Sandbox' }, ...Array.from({ length: 11 }, (_, index) => ({ id: `demo-${index}`, name: `Demo entity ${index + 1}` }))]), { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('note')).toHaveTextContent('Only access you can manage is shown here')
    expect(screen.getByRole('region', { name: 'Entity access editor' })).toHaveTextContent('1 selected')
    expect(screen.getByRole('region', { name: 'Assigned entity access' })).toHaveTextContent('Coverage')
    expect(screen.getByRole('region', { name: 'Assigned entity access' })).toHaveTextContent('ACME Sandbox')
    expect(screen.queryByRole('searchbox', { name: 'Find an entity' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Add entity access' }))
    expect(screen.queryByRole('region', { name: 'Editing selected scope' })).not.toBeInTheDocument()
    expect(screen.getByText('Select entities to add')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an entity' }), { target: { value: 'Demo entity 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Demo entity 11' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Demo entity 10' }))
    expect(screen.getByRole('button', { name: 'Select Demo entity 11' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 entities selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }))
    expect(screen.getByRole('button', { name: 'Edit access for Demo entity 11' })).toHaveTextContent('Edit')
    expect(screen.getByRole('button', { name: 'Edit access for Demo entity 10' })).toHaveTextContent('Edit')
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' }))
    expect(screen.getByRole('button', { name: 'Edit access for Demo entity 11' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add entity access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add access for All entities' }))
    expect(screen.getByRole('region', { name: 'Editing selected scope' })).toHaveTextContent('Entity and QuickBooks access only')
    expect(screen.getByRole('region', { name: 'Editing selected scope' })).not.toHaveTextContent('follows this entity access')
    expect(screen.queryByRole('button', { name: 'Edit access for Demo entity 11' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit access for Demo entity 10' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use selected entities instead' }))
    expect(screen.getByRole('searchbox', { name: 'Find an entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' }))
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveTextContent('From all entities')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('Ana')
    expect(review).toHaveTextContent('Operator')
    expect(review).toHaveTextContent('Allowed')
    expect(review).toHaveTextContent('All entities')
    expect(review).toHaveTextContent('+ Edit')
    expect(review).toHaveTextContent('No impact')
    const previewRequest = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const previewBody = JSON.parse(String(previewRequest?.[1]?.body)) as { grants: { operation: string; client_id: string | null }[] }
    expect(previewBody.grants.filter((grant) => grant.client_id === 'client-1').map((grant) => grant.operation)).toEqual(['client.read'])
    expect(previewBody.grants.filter((grant) => grant.client_id === null).map((grant) => grant.operation)).toEqual(['qbo.entity.edit'])
    expect(review).not.toHaveTextContent('Nothing has been saved yet')
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
    expect(screen.getByRole('button', { name: 'Actions & entities' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
  }, 15000)

  it('reconciles a role downgrade in the shared draft without visiting the access tab', async () => {
    mockGoogleSession([{ id: 'users-grant', operation: 'access.manage', client_id: null, environment: null }, { id: 'entities-grant', operation: 'entities.manage', client_id: null, environment: null }, { id: 'qbo-edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return new Response(JSON.stringify([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Admin', status: 'active', issuer: null, sub: null }]), { status: 200 })
      if (path.endsWith('/access/grants?user_id=user-2')) return new Response(JSON.stringify([
        { operation: 'client.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
        { operation: 'access.manage', client_id: null, environment: null },
        { operation: 'entities.manage', client_id: null, environment: null },
      ]), { status: 200 })
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return new Response(JSON.stringify({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] }), { status: 200 })
      if (path.endsWith('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'ACME Sandbox', environments: ['sandbox'] }]), { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    expect(await screen.findByRole('button', { name: 'Review changes' })).toBeDisabled()
    expect(screen.queryByText(/Admin permits sensitive actions/)).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    expect(screen.getByText(/QBO connection is included for assigned entities in configured environments/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Admin → Operator')
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Manage access' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('Admin → Operator')
    expect(review).toHaveTextContent('− Manage entities · Role limit')
    expect(review).toHaveTextContent('− Manage access · Role limit')
    expect(review).not.toHaveTextContent('− Edit')
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/access/users/user-2/policy/preview'), expect.objectContaining({ body: JSON.stringify({ role: 'Operator', status: 'active', grants: [
      { operation: 'client.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ] }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin/ }))
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Manage entities in FinOps' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Manage access' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('preselects entity Edit when upgrading a Viewer to Operator', async () => {
    mockGoogleSession([{ id: 'users-grant', operation: 'access.manage', client_id: null, environment: null }, { id: 'edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'client.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      ])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    expect(await screen.findByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/access/users/user-2/policy/preview'), expect.objectContaining({ body: JSON.stringify({
      role: 'Operator', status: 'active', grants: [
        { operation: 'client.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      ],
    }) }))
  })

  it('limits suggested global Edit to selected entities while keeping global Read', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'qbo.entity.read', client_id: null, environment: null }])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    await screen.findByRole('button', { name: 'Review changes' })
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limit Edit to selected entities' }))
    expect(screen.getByRole('button', { name: 'Select First entity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Second entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select First entity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Edit scope' }))
    expect(screen.getByRole('region', { name: 'Entity access editor' })).toHaveTextContent('All current and future entities · 1 with additional access')
    expect(screen.getByRole('button', { name: 'Edit access for First entity' })).toHaveTextContent('Additional access: Edit')
    fireEvent.click(screen.getByRole('button', { name: 'Add Edit to selected entities' }))
    expect(screen.queryByRole('button', { name: 'Select First entity' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Second entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(call?.[1]?.body)) as { grants: { operation: string; client_id: string | null; environment: string | null }[] }
    expect(body.grants).toEqual([
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ])
  })

  it('shows individual Read grants moving to All entities as one scope change', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      ])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add entity access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add access for All entities' }))
    expect(screen.getByRole('region', { name: 'Assigned entity access' })).toHaveTextContent('Base access')
    expect(screen.queryByRole('button', { name: 'Edit access for First entity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read QuickBooks data for entity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('Read: 2 selected entities → all entities')
    expect(review).not.toHaveTextContent('− Read')
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    expect(JSON.parse(String(call?.[1]?.body)).grants).toEqual([{ operation: 'qbo.entity.read', client_id: null, environment: null }])
  })

  it('converts All entities directly to selected entities without deleting access first', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'qbo.entity.read', client_id: null, environment: null },
        { operation: 'qbo.entity.edit', client_id: null, environment: null },
      ])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use selected entities instead' }))
    expect(screen.getByRole('button', { name: 'Select First entity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Second entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select First entity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep selected entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(call?.[1]?.body)) as { grants: { operation: string; client_id: string | null; environment: string | null }[] }
    expect(body.grants).toEqual([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ])
  })

  it('suggests standard Admin access across existing scopes and console controls', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'entities-grant', operation: 'entities.manage', client_id: null, environment: null },
      { id: 'activity-grant', operation: 'activity.read', client_id: null, environment: null },
      { id: 'keys-grant', operation: 'keys.admin', client_id: null, environment: null },
      { id: 'client-grant', operation: 'client.read', client_id: null, environment: null },
      { id: 'qbo-read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'qbo-edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'client.read', client_id: 'client-1', environment: null },
        { operation: 'client.read', client_id: 'client-2', environment: null },
      ])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    await screen.findByRole('button', { name: 'Review changes' })
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    for (const entity of ['First entity', 'Second entity']) {
      fireEvent.click(screen.getByRole('button', { name: `Edit access for ${entity}` }))
      expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Read QuickBooks data for entity' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Editing selected scope' })).toHaveTextContent('Read')
      expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(screen.getByRole('button', { name: 'Manage access' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Manage entities in FinOps' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Console access' })).queryByRole('button', { name: 'Manage entities in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Editing selected scope' })).not.toHaveTextContent('Manage entities')
    expect(within(screen.getByRole('region', { name: 'Console access' })).queryByRole('group', { name: 'Entity management coverage' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Console access' })).not.toHaveTextContent('Edit/delete assigned entities')
    fireEvent.click(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(screen.queryByText('Some assigned entities have no Edit QBO. Entity management remains separate.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(screen.getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Administer API keys' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const request = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(request?.[1]?.body)) as { grants: { operation: string; client_id: string | null }[] }
    expect(body.grants).toHaveLength(6)
    for (const clientId of ['client-1', 'client-2']) {
      expect(body.grants.filter((grant) => grant.client_id === clientId).map((grant) => grant.operation)).toEqual(expect.arrayContaining(['client.read', 'qbo.entity.read', 'qbo.entity.edit']))
    }
    expect(body.grants.filter((grant) => grant.client_id === null).map((grant) => grant.operation)).not.toContain('entities.manage')
    expect(body.grants.some((grant) => grant.operation === 'entities.manage')).toBe(false)
  })

  it('derives person connection access from role and assigned entity without a selectable grant', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'entities-grant', operation: 'entities.manage', client_id: null, environment: null },
      { id: 'activity-grant', operation: 'activity.read', client_id: null, environment: null },
      { id: 'keys-grant', operation: 'keys.admin', client_id: null, environment: null },
      { id: 'client-grant', operation: 'client.read', client_id: null, environment: null },
      { id: 'qbo-read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'qbo-edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return new Response(JSON.stringify([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null }]), { status: 200 })
      if (path.endsWith('/access/grants?user_id=user-2')) return new Response(JSON.stringify([{ operation: 'client.read', client_id: 'client-1', environment: null }]), { status: 200 })
      if (path.endsWith('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'Allowed entity', environments: ['sandbox', 'prod'] }]), { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users/user-2']}><AuthProvider><Routes>
      <Route path="/access/users" element={<AccessAdministrationPage />} />
      <Route path="/access/users/:userId" element={<AccessUserDetailPage />} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Change access for Ana' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin/ }))
    expect(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator · Saved/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled()
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Edit access for Allowed entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Assigned entity access' })).toHaveTextContent('Allowed entity')
    expect(screen.queryByRole('button', { name: /Add .* recommendations for this scope/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Editing selected scope' })).not.toHaveTextContent('QuickBooks connect / reconnect follows this entity access')
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Read QuickBooks data' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit access for Allowed entity' })).toHaveTextContent('View')
    fireEvent.click(screen.getByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin/ }))
    expect(screen.getByText(/Standard access suggested/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage access' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Manage entities in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Administer API keys' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Edit access for Allowed entity' })).toHaveTextContent('Read · Edit')
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveTextContent('Reset draft')
    expect(screen.getByRole('button', { name: 'Review changes' })).toHaveTextContent('Review changes')
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveClass('icon-first-action')
    expect(screen.getByRole('button', { name: 'Review changes' })).toHaveClass('icon-first-action')
    const editor = screen.getByRole('dialog')
    expect(editor.querySelector('[data-dialog-header]')).toContainElement(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(editor.querySelector('[data-dialog-header]')).toHaveClass('shrink-0')
    expect(editor.querySelector('[data-dialog-body]')).toHaveClass('min-h-0', 'overflow-y-auto')
    expect(editor.querySelector('[data-dialog-footer]')).toHaveClass('shrink-0')
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('heading', { name: 'Change access for Ana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    expect(await screen.findByRole('button', { name: 'Edit access for Allowed entity' })).toHaveTextContent('View')
  }, 15000)

  it('lets an Admin grant Activity and API key administration without switching entity scope', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'activity-grant', operation: 'activity.read', client_id: null, environment: null },
      { id: 'keys-grant', operation: 'keys.admin', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'admin@example.test', display_name: 'Admin', role: 'Admin', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'client.read', client_id: 'client-1', environment: null }, { operation: 'access.manage', client_id: null, environment: null }])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME Sandbox' }])
      if (path.endsWith('/access/users/user-2/policy/preview')) return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [], changes: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Admin' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    const consoleAccess = screen.getByRole('region', { name: 'Console access' })
    fireEvent.click(within(consoleAccess).getByRole('button', { name: 'View activity history' }))
    fireEvent.click(within(consoleAccess).getByRole('button', { name: 'Administer API keys' }))
    expect(within(consoleAccess).getAllByText('Added')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(screen.queryByText(/Admin can manage sensitive access/)).not.toBeInTheDocument()
    const previewCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(previewCall?.[1]?.body))
    expect(body.grants).toEqual(expect.arrayContaining([
      { operation: 'activity.read', client_id: null, environment: null },
      { operation: 'keys.admin', client_id: null, environment: null },
    ]))
  }, 15000)

  it('closes on backdrop without changes and confirms before discarding changes', async () => {
    mockGoogleSession([{ id: 'users-grant', operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return new Response(JSON.stringify([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }]), { status: 200 })
      if (path.endsWith('/access/grants?user_id=user-2')) return new Response('[]', { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    const openEditor = async () => {
      fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
      await screen.findByRole('heading', { name: 'Change access for Ana' })
      const dialog = screen.getByRole('dialog')
      vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, right: 500, bottom: 500, width: 400, height: 400, x: 100, y: 100, toJSON: () => ({}) })
      return dialog
    }
    const firstDialog = await openEditor()
    fireEvent.mouseDown(firstDialog, { clientX: 50, clientY: 50 })
    expect(screen.queryByRole('heading', { name: 'Change access for Ana' })).not.toBeInTheDocument()
    const secondDialog = await openEditor()
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    fireEvent.mouseDown(secondDialog, { clientX: 50, clientY: 50 })
    expect(screen.getByRole('heading', { name: 'Discard your changes?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('heading', { name: 'Change access for Ana' })).toBeInTheDocument()
  })

  it('requires explicit confirmation to permanently delete a person and keeps Activity history', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'grants-grant', operation: 'entities.manage', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    let deleted = false
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify(deleted ? [] : [{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'disabled', issuer: null, sub: null }]), { status: 200 })
      if (path.endsWith('/access/grants?user_id=user-2')) return new Response('[]', { status: 200 })
      if (path.endsWith('/access/users/user-2') && init?.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }) }
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes>
      <Route path="/access/users" element={<AccessAdministrationPage />} />
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('link', { name: 'Change access for Ana' })).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Change access for Ana' }))
    expect(await screen.findByRole('button', { name: 'Delete user' })).toHaveTextContent('Delete user')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('absolute')
    expect(screen.getByRole('button', { name: 'Actions & entities' })).toHaveClass('text-slate-950')
    expect(screen.getByRole('button', { name: 'Delete user' }).closest('[data-dialog-footer]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Role & sign-in' })).toHaveAttribute('aria-pressed', 'true')
    const signIn = screen.getByRole('group', { name: 'Sign-in status' })
    expect(within(signIn).getByRole('button', { name: /Allow sign-in/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(signIn).getByRole('button', { name: /Pause sign-in/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(signIn).queryByRole('button', { name: 'Delete user' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete user' })).toHaveAttribute('aria-label', 'Delete user')
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }))
    expect(screen.getByText(/Activity history remains available/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete person' })).toBeDisabled()
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/automations/api/access/users/user-2', expect.objectContaining({ method: 'DELETE' }))
    const confirmation = screen.getByRole('textbox', { name: 'Type DELETE to confirm' })
    expect(confirmation).toHaveAttribute('autocomplete', 'off')
    fireEvent.change(confirmation, { target: { value: 'delete' } })
    expect(screen.getByRole('button', { name: 'Delete person' })).toBeDisabled()
    fireEvent.change(confirmation, { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete person' }))
    expect(await screen.findByText('Person deleted. Activity history was retained.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Change access for Ana' })).not.toBeInTheDocument()
  })

  it('warns that allowing sign-in does not reactivate suspended API keys', async () => {
    mockGoogleSession([{ id: 'users-grant', operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'disabled', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'client.read', client_id: 'client-1', environment: null }])
      if (path.endsWith('/access/users/user-2/policy/preview')) return Response.json({ fingerprint: 'reenable-preview', affected_keys: [], suspended_keys: [], changes: ['Status: disabled → active'] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    await screen.findByRole('group', { name: 'Sign-in status' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Sign-in status' })).getByRole('button', { name: /Allow sign-in/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const impact = await screen.findByRole('region', { name: 'API key impact' })
    expect(impact).toHaveTextContent('Suspended keys stay suspended')
    expect(impact).toHaveTextContent('must create new keys')
    expect(impact).not.toHaveTextContent('No impact')
  })

  it('keeps the signed-in person in My account rather than the administration list', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'grants-grant', operation: 'entities.manage', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/users')) return new Response(JSON.stringify([
        { id: 'user-1', email: 'jorge@example.test', display_name: 'Jorge', role: 'Admin', status: 'active', issuer: 'https://accounts.google.com', sub: 'sub-1' },
      ]), { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes>
      <Route element={<AppLayout />}><Route element={<RequireUsersAdmin />}>
        <Route path="/access/users" element={<AccessAdministrationPage />} />
        <Route path="/access/users/:userId" element={<AccessUserDetailPage />} />
      </Route><Route path="/access" element={<AccessHomePage />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'People and access' })).toBeInTheDocument()
    expect(screen.getByText('No other people added yet')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'People' })).queryByText('Jorge')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'My account' }))
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage access')
    expect(screen.getByText('jorge@example.test')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
    fireEvent.focus(screen.getByRole('button', { name: 'About your role' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Your role sets the actions available; the permissions below show where they apply.')
  })

  it('lets only a Founder create a superadmin without individual grants', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const requests: Array<{ path: string; init?: RequestInit }> = []
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: true }, effective_grants: [{ operation: 'access.manage', client_id: null, environment: null }] })
      if (path.endsWith('/access/users')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = screen.getByRole('dialog', { name: 'Add person' })
    expect(within(dialog).queryByLabelText('Google email')).not.toBeInTheDocument()
    fireEvent.click(await within(dialog).findByRole('button', { name: /Superadmin/ }))
    fireEvent.change(await within(dialog).findByLabelText('Google email'), { target: { value: 'new-admin@example.test' } })
    expect(within(dialog).queryByRole('group', { name: 'Role' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to review' }))
    await within(dialog).findByRole('region', { name: 'Superadmin access summary' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review person' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add person' }))
    await screen.findByText('Person added with the selected access.')
    const create = requests.find((request) => request.path.endsWith('/access/users') && request.init?.method === 'POST')
    expect(JSON.parse(String(create?.init?.body))).toMatchObject({ email: 'new-admin@example.test', is_super_admin: true, grants: [] })
  })

  it('requires the typed phrase to transfer Founder status to a bound active superadmin', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const requests: Array<{ path: string; init?: RequestInit }> = []
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: true }, effective_grants: [{ operation: 'access.manage', client_id: null, environment: null }] })
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'next-founder@example.test', display_name: 'Next founder', role: 'Admin', status: 'active', issuer: 'https://accounts.google.com', sub: 'google-sub-2', is_super_admin: true, is_super_admin_founder: false }])
      if (path.endsWith('/founder-transfer') && init?.method === 'POST') return Response.json({ ok: true })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users?edit=user-2']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    const dialog = await screen.findByRole('dialog', { name: 'Change access for Next founder' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer Founder status' }))
    const confirm = within(dialog).getByRole('button', { name: 'Confirm transfer' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Type I AM NO LONGER FOUNDER to confirm'), { target: { value: 'I AM NO LONGER FOUNDER' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(requests.some((request) => request.path.endsWith('/founder-transfer'))).toBe(true))
    const transfer = requests.find((request) => request.path.endsWith('/founder-transfer'))
    expect(transfer?.init?.method).toBe('POST')
    expect(JSON.parse(String(transfer?.init?.body))).toEqual({ confirmation: 'I AM NO LONGER FOUNDER' })
  })

  it('retains the local login when no Google session exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Authentication required' }), { status: 401 }))
    await act(async () => render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('shows an access explanation instead of a raw callback error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Authentication required' }), { status: 401 }))
    await act(async () => render(<MemoryRouter initialEntries={['/login?auth_error=not_authorized']}><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>))
    expect(screen.getByRole('alert')).toHaveTextContent("Access isn't enabled for this account")
    expect(screen.getByRole('alert')).toHaveTextContent('ask a FinOps administrator to add your email in People and access')
    expect(screen.getByRole('alert').querySelector('svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })
})
