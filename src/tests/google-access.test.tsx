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
  it.each([false, true])('keeps the full access breakdown for superadmin (founder: %s)', async (founder) => {
    mockGoogleSession([])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/me')) return Response.json({
        user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: founder },
        effective_grants: [],
      })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access']}><AuthProvider><Routes><Route path="/access" element={<AccessHomePage />} /></Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('region', { name: 'Entity access' })).toHaveTextContent('All entities')
    expect(screen.getByRole('region', { name: 'Entity access' })).toHaveTextContent('Read · Edit · Delete')
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage people')
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage entities')
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('View activity history')
    expect(screen.getByText(founder ? 'Founder · Superadmin' : 'Superadmin')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Entities and effective access'))
    expect(await screen.findByText('Allowed entity')).toBeInTheDocument()
  })

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
    const transactionCard = within(overview).getByRole('link', { name: /QBO transactions/ })
    expect(transactionCard).toHaveTextContent('Latest: Viewed QuickBooks data for Allowed entity by owner@example.test')
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
    expect(within(entityAccess).getAllByText('Read').length).toBeGreaterThan(0)
    expect(within(entityAccess).getAllByText('Edit', { exact: false }).length).toBeGreaterThan(0)
    expect(within(entityAccess).queryByText('Manage entities')).not.toBeInTheDocument()
    const consoleAccess = screen.getByRole('region', { name: 'Administration access' })
    expect(within(consoleAccess).getAllByText('Manage entities')).toHaveLength(1)
    expect(within(consoleAccess).getByRole('link', { name: 'Manage entities' })).toHaveAttribute('href', '/qbo/clients')
    expect(consoleAccess).not.toHaveTextContent('Create anywhere · Edit/delete: all assigned entities')
    expect(entityAccess.parentElement).toHaveClass('items-stretch')
    fireEvent.click(within(entityAccess).getByText('Entities and effective access'))
    await waitFor(() => expect(entityAccess.parentElement).toHaveClass('items-start'))
    const effectiveList = within(entityAccess).getByRole('list', { name: 'Effective entity access' })
    expect(within(effectiveList).getAllByRole('listitem')).toHaveLength(13)
    expect(effectiveList).toHaveClass('entity-access-scroll-list', 'pr-3')
    const effectiveEntityLink = within(effectiveList).getByRole('link', { name: 'ACME Sandbox' })
    expect(effectiveEntityLink).toHaveClass('w-full', 'hover:bg-teal-50')
    expect(effectiveEntityLink).toHaveAttribute('href', '/qbo/clients/client-1')
    expect(within(effectiveEntityLink).getByText('Edit')).toHaveClass('rounded-md')
    expect(within(effectiveList).getByText('Demo · Entity 12')).toBeInTheDocument()
    expect(within(effectiveList).getByText('ACME Sandbox').closest('li')).toHaveTextContent('Read')
    expect(within(effectiveList).getByText('ACME Sandbox').closest('li')).toHaveTextContent('Edit')
    fireEvent.change(within(entityAccess).getByRole('searchbox', { name: 'Filter entities' }), { target: { value: 'Entity 12' } })
    expect(within(effectiveList).getAllByRole('listitem')).toHaveLength(1)
    expect(within(entityAccess).getAllByText('ACME Sandbox')).toHaveLength(1)
    expect(within(entityAccess).getByText('Demo · Entity 12')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'QuickBooks connections' })).not.toBeInTheDocument()
    fireEvent.click(within(entityAccess).getByText('Entities and effective access'))
    await waitFor(() => expect(entityAccess.parentElement).toHaveClass('items-stretch'))
  })

  it('links assigned entities and expands only their card after three rows', async () => {
    mockGoogleSession([
      ...Array.from({ length: 5 }, (_, index) => ({ operation: 'qbo.entity.read', client_id: `client-${index + 1}`, environment: null })),
      { operation: 'access.manage', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => String(input).endsWith('/clients')
      ? Response.json(Array.from({ length: 5 }, (_, index) => ({ id: `client-${index + 1}`, name: `Entity ${index + 1}`, status: 'active' })))
      : baseFetch(input, init))
    await act(async () => render(<MemoryRouter initialEntries={['/access']}><AuthProvider><Routes><Route path="/access" element={<AccessHomePage />} /></Routes></AuthProvider></MemoryRouter>))
    const entityAccess = screen.getByRole('region', { name: 'Entity access' })
    const adminAccess = screen.getByRole('region', { name: 'Administration access' })
    const firstEntityLink = await within(entityAccess).findByRole('link', { name: 'Entity 1' })
    expect(firstEntityLink).toHaveAttribute('href', '/qbo/clients/client-1')
    expect(firstEntityLink).toHaveClass('hover:bg-teal-50')
    expect(firstEntityLink).toHaveClass('min-h-11')
    expect(firstEntityLink).toHaveClass('flex')
    expect(firstEntityLink).toHaveTextContent('Read')
    expect(within(firstEntityLink).getByText('Read')).toHaveClass('rounded-md')
    expect(firstEntityLink).toHaveClass('w-full')
    expect(firstEntityLink.querySelector('svg')).not.toBeInTheDocument()
    expect(within(entityAccess).getAllByRole('link')).toHaveLength(3)
    expect(within(entityAccess).queryByRole('link', { name: 'Entity 4' })).not.toBeInTheDocument()
    expect(entityAccess.parentElement).toHaveClass('items-stretch')
    expect(adminAccess).toHaveClass('h-full')
    fireEvent.click(within(entityAccess).getByRole('button', { name: 'Show 2 more entities' }))
    expect(within(entityAccess).getAllByRole('link')).toHaveLength(5)
    expect(within(entityAccess).getByRole('link', { name: 'Entity 5' })).toHaveAttribute('href', '/qbo/clients/client-5')
    expect(entityAccess.parentElement).toHaveClass('items-start')
    expect(adminAccess).not.toHaveClass('h-full')
    fireEvent.click(within(entityAccess).getByRole('button', { name: 'Show fewer entities' }))
    expect(within(entityAccess).getAllByRole('link')).toHaveLength(3)
    expect(entityAccess.parentElement).toHaveClass('items-stretch')
    expect(adminAccess).toHaveClass('h-full')
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
    expect(screen.getAllByText('Production').length).toBeGreaterThan(0)
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByText('viewed QuickBooks data for Allowed entity')).toBeInTheDocument()
    expect(screen.queryByText('api_key_id')).not.toBeInTheDocument()
    expect(screen.queryByText('qbo.account.read')).not.toBeInTheDocument()
    expect(screen.queryByText('503')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Support reference' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Details'))
    expect(screen.getByText('Support reference')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy support reference' })).toBeInTheDocument()
    expect(screen.getByLabelText('Activity history')).not.toHaveClass('overflow-hidden')
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
    expect(screen.getByRole('button', { name: 'Everyone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unidentified' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by email' }), { target: { value: 'owner' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'owner@example.test' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('scope=completed&page=1&actor_email=owner%40example.test'), expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /^When / }))
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Last 7 days' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('from_at='), expect.anything())
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).toBe('/automations/api/access/activity/summary?limit=25&scope=completed&page=1')
    fireEvent.click(screen.getByRole('button', { name: /^Operation / }))
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Deleted' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('category=delete'), expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /^Operation / }))
    await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Any operation' })))
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).not.toContain('category=')
    fireEvent.click(screen.getByRole('button', { name: /^Person / }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Unidentified' })))
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).toContain('actor_email=Unidentified+actor')
    fireEvent.click(screen.getByRole('button', { name: /^Person / }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Everyone' })))
    expect(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]).not.toContain('actor_email=')
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
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage people')
    expect(screen.queryByText('access.manage')).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/clients'), expect.anything())
  })

  it('links each Admin access item to its destination', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'activity.read', client_id: null, environment: null },
      { operation: 'entities.manage', client_id: null, environment: null },
      { operation: 'keys.admin', client_id: null, environment: null },
    ])
    await act(async () => render(<MemoryRouter initialEntries={['/access']}><AuthProvider><Routes><Route path="/access" element={<AccessHomePage />} /></Routes></AuthProvider></MemoryRouter>))
    const adminAccess = screen.getByRole('region', { name: 'Administration access' })
    expect(within(adminAccess).getByRole('link', { name: 'Manage people' })).toHaveAttribute('href', '/access/users')
    expect(within(adminAccess).getByRole('link', { name: 'View activity history' })).toHaveAttribute('href', '/access/activity')
    expect(within(adminAccess).getByRole('link', { name: 'Manage entities' })).toHaveAttribute('href', '/qbo/clients')
    expect(within(adminAccess).getByRole('link', { name: 'Manage entities' }).querySelector('svg')).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-focus-visible:opacity-100')
    expect(within(adminAccess).queryByRole('link', { name: 'Administer API keys' })).not.toBeInTheDocument()
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
      { id: 'qbo-delete-grant', operation: 'qbo.entity.delete', client_id: null, environment: null },
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
    const emailInput = await screen.findByRole('textbox', { name: 'Google email' }) as HTMLInputElement
    expect(emailInput).toHaveValue('@headquarters.co')
    expect(emailInput).toHaveAttribute('placeholder', 'name@headquarters.co')
    expect(screen.getByText('name', { selector: 'span' })).toBeInTheDocument()
    fireEvent.focus(emailInput)
    expect(emailInput).toHaveProperty('selectionStart', 0)
    expect(screen.queryByText('name', { selector: 'span' })).not.toBeInTheDocument()
    emailInput.setSelectionRange(10, 10)
    fireEvent.click(emailInput)
    expect(emailInput).toHaveProperty('selectionStart', 0)
    emailInput.setSelectionRange(0, emailInput.value.length)
    fireEvent.click(emailInput)
    expect(emailInput).toHaveProperty('selectionEnd', emailInput.value.length)
    const addDialog = screen.getByRole('dialog', { name: 'Add person' })
    expect(within(addDialog).getByRole('button', { name: 'Cancel' })).toHaveClass('absolute')
    expect(within(addDialog).queryByRole('group', { name: 'Sign-in status' })).not.toBeInTheDocument()
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    const accessStep = within(addDialog).getByRole('button', { name: '2 · Access' })
    expect(accessStep).toBeDisabled()
    expect(within(addDialog).getByRole('button', { name: 'Continue to access' })).toBeDisabled()
    fireEvent.click(accessStep)
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    emailInput.setSelectionRange(0, emailInput.value.length)
    fireEvent.change(emailInput, { target: { value: '' } })
    expect(emailInput).toHaveValue('')
    fireEvent.change(emailInput, { target: { value: 'ana@example.test' } })
    expect(emailInput).toHaveValue('ana@example.test')
    fireEvent.change(emailInput, { target: { value: 'invalid name' } })
    expect(accessStep).toBeDisabled()
    fireEvent.change(emailInput, { target: { value: 'ana@example.test' } })
    expect(emailInput).toHaveValue('ana@example.test')
    expect(accessStep).toBeEnabled()
    expect(accessStep).not.toHaveAttribute('aria-current')
    expect(within(addDialog).getByRole('button', { name: /^Viewer/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Continue to access' }))
    fireEvent.click(await within(addDialog).findByRole('button', { name: /All available entities/ }))
    expect(within(addDialog).getByRole('button', { name: 'Read QuickBooks data for entity' })).toBeDisabled()
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).not.toHaveTextContent('Included')
    expect(within(addDialog).queryByRole('button', { name: 'Edit QuickBooks data for entity' })).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('button', { name: 'Delete QuickBooks data for entity' })).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Back' }))
    fireEvent.click(within(addDialog).getByRole('button', { name: /^Admin/ }))
    expect(within(addDialog).getByText('Same as Operator')).toBeInTheDocument()
    expect(within(addDialog).getByText('Delete data*').closest('ul')).toHaveClass('text-hq-teal')
    expect(within(addDialog).getByText('Use granted admin tools')).toBeInTheDocument()
    expect(within(addDialog).getByText('* QuickBooks data for assigned entities.')).toBeInTheDocument()
    expect(within(addDialog).queryByText(/Manage entities also allows this person/)).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Continue to access' }))
    await within(addDialog).findByRole('button', { name: /All available entities/ })
    fireEvent.click(within(addDialog).getByRole('button', { name: /All available entities/ }))
    const administration = within(addDialog).getByRole('group', { name: 'Console administration' })
    expect(administration).toHaveTextContent('Manage entities allows creation; other actions and delegation stay within your access.')
    expect(within(addDialog).getByRole('region', { name: 'Entities and permissions' })).toContainElement(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' }))
    expect(within(addDialog).getByRole('region', { name: 'Entities and permissions' })).not.toContainElement(administration)
    expect(within(administration).queryByText('Selected admin permissions')).not.toBeInTheDocument()
    expect(within(administration).getByRole('button', { name: 'Manage people' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(administration).getByRole('button', { name: 'Manage people' })).toHaveTextContent('Not granted')
    expect(within(administration).getByRole('button', { name: 'Manage entities in FinOps' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(addDialog).queryByRole('group', { name: 'Entity management' })).not.toBeInTheDocument()
    expect(within(administration).getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(administration).queryByRole('button', { name: 'Administer API keys' })).not.toBeInTheDocument()
    fireEvent.click(within(administration).getByRole('button', { name: 'View activity history' }))
    expect(within(administration).getByText('View activity history and event details.')).toBeInTheDocument()
    expect(within(administration).getByRole('button', { name: 'View activity history' })).toHaveTextContent('Granted')
    fireEvent.click(within(administration).getByRole('button', { name: 'View activity history' }))
    expect(within(administration).queryByText('Selected admin permissions')).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(within(addDialog).getByRole('button', { name: 'Read QuickBooks data for entity' })).toBeDisabled()
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).toHaveTextContent('Read')
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).not.toHaveTextContent(/Included|Enabled|Not added|Granted/)
    expect(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toBeEnabled()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(within(addDialog).getByRole('button', { name: 'Delete QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Delete QuickBooks data for entity' }))
    expect(within(addDialog).getByRole('button', { name: 'Delete QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Delete QuickBooks data for entity' }))
    expect(within(addDialog).getByRole('button', { name: 'Delete QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(administration).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Back' }))
    fireEvent.click(within(addDialog).getByRole('button', { name: /^Operator/ }))
    expect(within(addDialog).getByRole('button', { name: /^Operator/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(addDialog).getByText('Same as Viewer')).toBeInTheDocument()
    expect(within(addDialog).getByText('Edit data*')).toBeInTheDocument()
    expect(within(addDialog).getByText('Edit data*').closest('ul')).toHaveClass('text-hq-teal')
    expect(within(addDialog).getByText('Connect assigned entities to QuickBooks')).toBeInTheDocument()
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
    const createActions = within(addDialog).getByRole('group', { name: 'Entity selection actions' })
    expect(within(createActions).getByRole('button', { name: 'Select all available' })).toBeDisabled()
    fireEvent.click(within(createActions).getByRole('button', { name: 'Show selected' }))
    expect(within(createActions).getByRole('button', { name: 'Show selected' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(createActions).getByRole('button', { name: 'Clear selection' }))
    expect(within(createActions).getByRole('button', { name: 'Show selected' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(createActions).getByRole('button', { name: 'Select all available' }))
    expect(within(addDialog).getByRole('group', { name: 'Select entities' }).querySelector('input[type="checkbox"]')).toBeNull()
    expect(within(addDialog).getByRole('group', { name: 'Entity and QuickBooks access' })).toHaveTextContent('Read')
    expect(within(addDialog).queryByText(/No separate person permission is needed/)).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(within(addDialog).queryByRole('group', { name: 'Console administration' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Edit QuickBooks data for entity' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Delete QuickBooks data for entity' })).not.toBeInTheDocument()
    expect(within(addDialog).getByText('2 current entities selected')).toBeInTheDocument()
    expect(within(addDialog).getByText('2 current entities selected').closest('[data-dialog-footer]')).toBeInTheDocument()
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Back' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Google email' }), { target: { value: 'invalid name' } })
    expect(within(addDialog).getByRole('button', { name: '2 · Access' })).toBeDisabled()
    expect(within(addDialog).getByRole('button', { name: 'Continue to access' })).toBeDisabled()
    fireEvent.click(within(addDialog).getByRole('button', { name: '2 · Access' }))
    expect(within(addDialog).getByRole('button', { name: '1 · Person' })).toHaveAttribute('aria-current', 'step')
    fireEvent.change(screen.getByRole('textbox', { name: 'Google email' }), { target: { value: 'ana@example.test' } })
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

  it('creates an Admin with admin permissions and no selected entities', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const submitted: unknown[] = []
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true }, effective_grants: [{ operation: 'access.manage', client_id: null, environment: null }, { operation: 'entities.manage', client_id: null, environment: null }, { operation: 'activity.read', client_id: null, environment: null }] })
      if (path.endsWith('/access/users') && init?.method === 'POST') {
        submitted.push(JSON.parse(String(init.body)))
        return Response.json({ id: 'new-user' }, { status: 201 })
      }
      if (path.endsWith('/access/users')) return Response.json([])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = screen.getByRole('dialog', { name: 'Add person' })
    fireEvent.click(await within(dialog).findByRole('button', { name: /FinOps User/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to person' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Google email' }), { target: { value: 'admin@example.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Admin/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to access' }))
    const administration = await within(dialog).findByRole('group', { name: 'Console administration' })
    expect(within(dialog).getByText('0 current entities selected')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Review person' })).toBeDisabled()
    fireEvent.click(within(administration).getByRole('button', { name: 'Manage entities in FinOps' }))
    fireEvent.click(within(administration).getByRole('button', { name: 'View activity history' }))
    expect(within(dialog).getByRole('button', { name: 'Review person' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: /Selected entities/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allowed entity' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear selection' }))
    expect(within(dialog).getByText('0 current entities selected')).toBeInTheDocument()
    expect(within(administration).getByRole('button', { name: 'Manage entities in FinOps' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Review person' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review person' }))
    const review = await within(dialog).findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('+ Manage entities')
    expect(review).toHaveTextContent('+ Activity')
    expect(review).not.toHaveTextContent('+ Read')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add person' }))
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({ email: 'admin@example.test', role: 'Admin', is_super_admin: false, grants: [
      { operation: 'entities.manage', client_id: null, environment: null },
      { operation: 'activity.read', client_id: null, environment: null },
    ] })
  })

  it('preserves the selected-entities draft in Add person when switching scope options', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users') && init?.method !== 'POST') return Response.json([])
      if (path.endsWith('/clients')) return Response.json([1, 2, 3, 4].map((number) => ({ id: `client-${number}`, name: `Entity ${number}` })))
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = screen.getByRole('dialog', { name: 'Add person' })
    fireEvent.change(await within(dialog).findByRole('textbox', { name: 'Google email' }), { target: { value: 'new@example.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to access' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /Selected entities/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entity 1' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entity 2' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entity 3' }))
    expect(within(dialog).getByText('3 current entities selected')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /All available entities/ }))
    expect(within(dialog).getByText('4 current entities selected')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Selected entities/ }))
    expect(within(dialog).getByText('3 current entities selected')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review person' }))
    const review = await within(dialog).findByRole('region', { name: 'Policy impact preview' })
    expect(review).not.toHaveTextContent('Entity 4')
  })

  it.each(['Operator', 'Admin'] as const)('allows %s creation with Read but without the suggested Edit grant', async (role) => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const submitted: unknown[] = []
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/users') && init?.method === 'POST') {
        submitted.push(JSON.parse(String(init.body)))
        return Response.json({ id: 'new-user' }, { status: 201 })
      }
      if (String(input).endsWith('/access/users')) return Response.json([])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add person' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Google email' }), { target: { value: `${role.toLowerCase()}@example.test` } })
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${role}`) }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to access' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /All available entities/ }))
    const edit = within(dialog).getByRole('button', { name: 'Edit QuickBooks data for entity' })
    expect(edit).toHaveAttribute('aria-pressed', 'true')
    expect(edit).toBeEnabled()
    fireEvent.click(edit)
    expect(edit).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByRole('button', { name: 'Read QuickBooks data for entity' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review person' }))
    expect(await within(dialog).findByRole('region', { name: 'Policy impact preview' })).toHaveTextContent('+ Read')
    expect(within(dialog).getByRole('region', { name: 'Policy impact preview' })).not.toHaveTextContent('+ Edit')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add person' }))
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({ role, grants: [{ operation: 'qbo.entity.read', client_id: 'client-1', environment: null }] })
  })

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

  it('uses existing grants as an editable draft before review', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'qbo.entity.read', client_id: 'client-1', environment: null }])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME Sandbox' }, { id: 'client-2', name: 'Demo entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    const draft = screen.getByRole('region', { name: 'Entity access editor' })
    expect(within(draft).getByRole('region', { name: 'Access for ACME Sandbox' })).toHaveTextContent('Read')
    expect(within(draft).getByRole('region', { name: 'Access for Demo entity' })).toHaveTextContent('Not granted')
    fireEvent.click(within(draft).getByRole('button', { name: 'Entity access for Demo entity' }))
    expect(within(draft).getByRole('region', { name: 'Access for Demo entity' })).toHaveTextContent('Granted')
    expect(screen.getByText('2 current entities selected').closest('[data-dialog-footer]')).toBeInTheDocument()
    expect(within(draft).getByRole('region', { name: 'Access for Demo entity' })).toHaveTextContent('Edit')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(await screen.findByRole('region', { name: 'Policy impact preview' })).toHaveTextContent('Demo entity')
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
    expect(screen.getByRole('region', { name: 'Access for Demo entity' })).toHaveTextContent('Read')
    fireEvent.click(screen.getByRole('button', { name: 'Reset actions and entities' }))
    expect(screen.getByRole('button', { name: 'Entity access for Demo entity' })).toHaveAttribute('aria-pressed', 'false')
    const editActions = within(draft).getByRole('group', { name: 'Entity selection actions' })
    fireEvent.click(within(editActions).getByRole('button', { name: 'Select all available' }))
    expect(within(draft).getByRole('button', { name: 'Entity access for Demo entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(draft).getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(editActions).getByRole('button', { name: 'Show selected' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Show selected' }))
    expect(screen.getByRole('button', { name: 'Show selected' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('button', { name: 'Show selected' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Entity access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'false')
  }, 15000)

  it('requires reviewing entity scope before previewing a role downgrade', async () => {
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
    expect(screen.getByText('Same as Viewer')).toBeInTheDocument()
    expect(screen.getByText('Edit data*')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Admin → Operator')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.queryByText(/current entit(?:y|ies) selected/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin · Current/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to actions and entities' }))
    expect(screen.getByRole('button', { name: 'Actions & entities' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByText('1 current entity selected')).toBeInTheDocument()
    expect(screen.getByText('1 unsaved change').parentElement).toHaveTextContent('1 unsaved change·1 current entity selected')
    expect(screen.getByRole('region', { name: 'Entity access editor' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for ACME Sandbox' }))
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset actions and entities' }))
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Admin access' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('Admin → Operator')
    const permissionRows = within(within(review).getByRole('region', { name: 'Permission changes' })).getByText('FinOps console').parentElement?.parentElement
    expect(permissionRows?.firstElementChild).toHaveTextContent('FinOps console')
    expect(review).toHaveTextContent('− Manage entities · Role limit')
    expect(review).toHaveTextContent('− Manage people · Role limit')
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
    expect(screen.getByRole('button', { name: 'Manage people' })).toHaveAttribute('aria-pressed', 'true')
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
    expect(screen.getAllByRole('button', { name: /^Edit access for / })[0]).toHaveAttribute('aria-pressed', 'true')
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

  it('keeps entity access scoped to current IDs when changing a role', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'read-grant', operation: 'qbo.entity.read', client_id: null, environment: null },
      { id: 'edit-grant', operation: 'qbo.entity.edit', client_id: null, environment: null },
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
    fireEvent.click(await screen.findByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to actions and entities' }))
    expect(screen.getByRole('button', { name: /All available entitiesCurrent only/ })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    expect(JSON.parse(String(call?.[1]?.body)).grants).toEqual([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-2', environment: null },
    ])
  })

  it('adds only current available entities when choosing all', async () => {
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
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }, { id: 'client-3', name: 'New current entity' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: /All available entitiesCurrent only/ }))
    expect(screen.getByRole('region', { name: 'All entity access' })).toHaveTextContent('No automatic access to future entities')
    expect(screen.queryByRole('region', { name: 'Access for First entity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read QuickBooks data for entity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(review).toHaveTextContent('New current entity')
    expect(review).not.toHaveTextContent('− Read')
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    expect(JSON.parse(String(call?.[1]?.body)).grants).toEqual([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-3', environment: null },
    ])
  })

  it('keeps the selected-entities draft when visiting all available entities', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'qbo.entity.read', client_id: 'client-1', environment: null }])
      if (path.endsWith('/clients')) return Response.json([1, 2, 3, 4].map((number) => ({ id: `client-${number}`, name: `Entity ${number}` })))
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'draft-preview', affected_keys: [], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entity access for Entity 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entity access for Entity 3' }))
    expect(screen.getByText('3 current entities selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /All available entitiesCurrent only/ }))
    expect(screen.getByText('4 current entities selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Selected entities/ }))
    expect(screen.getByText('3 current entities selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entity access for Entity 4' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(call?.[1]?.body)) as { grants: { client_id: string | null }[] }
    expect(body.grants.map((grant) => grant.client_id).sort()).toEqual(['client-1', 'client-2', 'client-3'])
  })

  it('shows retained access beside new permissions and lists impacted keys compactly', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
      { operation: 'qbo.entity.delete', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Admin', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      ])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME' }])
      if (path.endsWith('/access/users/user-2/policy/preview') && init?.method === 'POST') return Response.json({ fingerprint: 'impact-preview', affected_keys: ['First', 'Second', 'Third', 'Fourth', 'Fifth'], suspended_keys: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete access for ACME' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const review = await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(within(review).getByLabelText('Read retained')).toBeInTheDocument()
    expect(within(review).getByLabelText('Edit retained')).toBeInTheDocument()
    expect(within(review).getByLabelText('Delete added')).toHaveTextContent('+ Delete')
    const keys = within(review).getByRole('region', { name: 'API key impact' })
    const keyList = within(keys).getByRole('list')
    const expandKeys = within(keys).getByRole('button', { name: 'Show all' })
    expect(keyList).toHaveTextContent('FirstSecondThird')
    expect(keyList.nextElementSibling).toBe(expandKeys)
    fireEvent.click(expandKeys)
    expect(within(keys).getAllByRole('list')).toHaveLength(1)
    expect(within(keys).getByText('Fourth')).toBeInTheDocument()
    expect(within(keys).getByText('Fifth')).toBeInTheDocument()
    fireEvent.click(within(keys).getByRole('button', { name: 'Show less' }))
    expect(within(keys).queryByText('Fourth')).not.toBeInTheDocument()
  })

  it('confirms API key suspension when saving without a separate acknowledgement', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([{ operation: 'client.read', client_id: 'client-1', environment: null }])
      if (path.endsWith('/access/users/user-2/policy/preview')) return Response.json({ fingerprint: 'pause-preview', affected_keys: [], suspended_keys: ['First', 'Second', 'Third', 'Fourth'] })
      if (path.endsWith('/access/users/user-2/policy') && init?.method === 'PUT') return Response.json({ ok: true })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    await screen.findByRole('group', { name: 'Sign-in status' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Sign-in status' })).getByRole('button', { name: /Pause sign-in/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    const keys = await screen.findByRole('region', { name: 'API key impact' })
    expect(keys).toHaveTextContent('4 will stop working')
    expect(within(keys).queryByRole('button', { name: 'Acknowledge impact' })).not.toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([input, init]) => String(input).endsWith('/access/users/user-2/policy') && init?.method === 'PUT')).toBe(true))
    const request = vi.mocked(globalThis.fetch).mock.calls.find(([input, init]) => String(input).endsWith('/access/users/user-2/policy') && init?.method === 'PUT')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ acknowledge_key_suspension: true })
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
    fireEvent.click(screen.getByRole('button', { name: /All available entitiesCurrent only/ }))
    fireEvent.click(screen.getByRole('button', { name: /Selected entities/ }))
    expect(screen.getByRole('region', { name: 'Access for First entity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Access for Second entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Entity access for Second entity' }))
    expect(screen.getByRole('region', { name: 'Access for Second entity' })).toHaveTextContent('Not granted')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const call = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(call?.[1]?.body)) as { grants: { operation: string; client_id: string | null; environment: string | null }[] }
    expect(body.grants).toEqual([
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ])
  })

  it('suggests Edit when Delete is selected without making Edit mandatory', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
      { operation: 'qbo.entity.edit', client_id: null, environment: null },
      { operation: 'qbo.entity.delete', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Admin', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.read', client_id: 'client-2', environment: null },
      ])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'First entity' }, { id: 'client-2', name: 'Second entity' }])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    const firstEntity = screen.getByRole('region', { name: 'Access for First entity' })
    fireEvent.click(within(firstEntity).getByRole('button', { name: 'Entity access for First entity' }))
    expect(firstEntity).toHaveTextContent('Not granted')
    fireEvent.click(within(firstEntity).getByRole('button', { name: 'Entity access for First entity' }))
    expect(firstEntity).toHaveTextContent('Granted')
    expect(within(firstEntity).getByRole('button', { name: 'Edit access for First entity' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(firstEntity).getByRole('button', { name: 'Delete access for First entity' }))
    expect(within(firstEntity).getByRole('button', { name: 'Entity access for First entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(firstEntity).getByRole('button', { name: 'Edit access for First entity' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(firstEntity).getByRole('button', { name: 'Edit access for First entity' }))
    expect(within(firstEntity).getByRole('button', { name: 'Delete access for First entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(firstEntity).getByRole('button', { name: 'Edit access for First entity' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: /All available entitiesCurrent only/ }))
    const allEntities = screen.getByRole('group', { name: 'QuickBooks access for all available entities' })
    expect(allEntities).not.toHaveTextContent('Included')
    fireEvent.click(within(allEntities).getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(within(allEntities).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(allEntities).getByRole('button', { name: 'Delete QuickBooks data for entity' }))
    expect(within(allEntities).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(allEntities).getByRole('button', { name: 'Edit QuickBooks data for entity' }))
    expect(within(allEntities).getByRole('button', { name: 'Delete QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(allEntities).getByRole('button', { name: 'Edit QuickBooks data for entity' })).toHaveAttribute('aria-pressed', 'false')
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
      const entityRow = screen.getByRole('region', { name: `Access for ${entity}` })
      expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Read QuickBooks data for entity' })).not.toBeInTheDocument()
      expect(entityRow).toHaveTextContent('Read')
      expect(within(entityRow).getByRole('button', { name: `Edit access for ${entity}` })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(screen.getByRole('button', { name: 'Manage people' })).toHaveAttribute('aria-pressed', 'false')
    const manageEntities = within(screen.getByRole('region', { name: 'Admin access' })).getByRole('button', { name: 'Manage entities in FinOps' })
    expect(manageEntities).toBeEnabled()
    fireEvent.click(manageEntities)
    expect(manageEntities).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Access for First entity' })).not.toHaveTextContent('Manage entities')
    expect(within(screen.getByRole('region', { name: 'Admin access' })).queryByRole('group', { name: 'Entity management coverage' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Admin access' })).not.toHaveTextContent('Edit/delete assigned entities')
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for First entity' }))
    expect(screen.queryByText('Some assigned entities have no Edit QBO. Entity management remains separate.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for First entity' }))
    expect(screen.getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Administer API keys' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const request = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(request?.[1]?.body)) as { grants: { operation: string; client_id: string | null }[] }
    expect(body.grants).toHaveLength(7)
    for (const clientId of ['client-1', 'client-2']) {
      expect(body.grants.filter((grant) => grant.client_id === clientId).map((grant) => grant.operation)).toEqual(expect.arrayContaining(['client.read', 'qbo.entity.read', 'qbo.entity.edit']))
    }
    expect(body.grants.filter((grant) => grant.client_id === null).map((grant) => grant.operation)).toContain('entities.manage')
  })

  it('lets an Admin delegate Manage entities within their assigned entity scope', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'entities.manage' },
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
      { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'jorge@headquarters.co', display_name: null, role: 'Admin', status: 'disabled', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([
        { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
        { operation: 'qbo.entity.edit', client_id: 'client-1', environment: null },
      ])
      if (path.endsWith('/access/users/user-2/policy/preview')) return Response.json({ fingerprint: 'fingerprint-1', affected_keys: [], suspended_keys: [], changes: [] })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for jorge@headquarters.co' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    const manageEntities = within(screen.getByRole('region', { name: 'Admin access' })).getByRole('button', { name: 'Manage entities in FinOps' })
    expect(manageEntities).toBeEnabled()
    fireEvent.click(manageEntities)
    expect(manageEntities).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    const previewCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(previewCall?.[1]?.body))
    expect(body.grants).toEqual(expect.arrayContaining([
      { operation: 'entities.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: 'client-1', environment: null },
    ]))
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
    expect(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator · Current/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to actions and entities' })).toBeEnabled()
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Operator/ }))
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('region', { name: 'Access for Allowed entity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Available entities' })).toHaveTextContent('Allowed entity')
    expect(screen.queryByRole('button', { name: /Add .* recommendations for this scope/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View entity in FinOps' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Access for Allowed entity' })).not.toHaveTextContent('QuickBooks connect / reconnect follows this entity access')
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Read QuickBooks data' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Access for Allowed entity' })).toHaveTextContent('Read')
    fireEvent.click(screen.getByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Admin/ }))
    expect(screen.getByText('* QuickBooks data for assigned entities.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'About suggested access' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.getByRole('button', { name: 'Edit access for Allowed entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage people' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Manage entities in FinOps' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'View activity history' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Administer API keys' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Access for Allowed entity' })).toHaveTextContent('Read')
    expect(screen.getByRole('region', { name: 'Access for Allowed entity' })).toHaveTextContent('Edit')
    expect(screen.queryByRole('button', { name: 'Reset actions and entities' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit access for Allowed entity' }))
    expect(screen.getByRole('button', { name: 'Reset actions and entities' })).toHaveTextContent('Reset actions & entities')
    expect(screen.getByRole('button', { name: 'Review changes' })).toHaveTextContent('Review changes')
    expect(screen.getByRole('button', { name: 'Reset actions and entities' })).toHaveClass('icon-first-action')
    expect(screen.getByRole('button', { name: 'Review changes' })).toHaveClass('icon-first-action')
    const editor = screen.getByRole('dialog')
    expect(editor.querySelector('[data-dialog-header]')).toContainElement(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(editor.querySelector('[data-dialog-header]')).toHaveClass('shrink-0')
    expect(editor.querySelector('[data-dialog-body]')).toHaveClass('min-h-0', 'overflow-y-auto')
    expect(editor.querySelector('[data-dialog-footer]')).toHaveClass('shrink-0')
    fireEvent.click(screen.getByRole('button', { name: 'Reset actions and entities' }))
    expect(screen.getByRole('heading', { name: 'Change access for Ana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit access for Allowed entity' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled()
    expect(screen.queryByRole('checkbox', { name: /Connect QuickBooks/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('link', { name: 'Change access for Ana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Actions & entities' }))
    expect(await screen.findByRole('region', { name: 'Access for Allowed entity' })).toHaveTextContent('Read')
  }, 15000)

  it('lets an Admin grant Activity without switching entity scope and hides legacy key administration', async () => {
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
    expect(screen.getByRole('region', { name: 'Access for ACME Sandbox' })).toBeInTheDocument()
    const consoleAccess = screen.getByRole('region', { name: 'Admin access' })
    expect(consoleAccess).toHaveTextContent('Manage entities allows creation; other actions and delegation stay within your access.')
    fireEvent.click(within(consoleAccess).getByRole('button', { name: 'View activity history' }))
    expect(within(consoleAccess).queryByRole('button', { name: 'Administer API keys' })).not.toBeInTheDocument()
    expect(within(consoleAccess).getByRole('button', { name: 'View activity history' })).toHaveTextContent('Granted')
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))
    await screen.findByRole('region', { name: 'Policy impact preview' })
    expect(screen.queryByText(/Admin can manage sensitive access/)).not.toBeInTheDocument()
    const previewCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith('/access/users/user-2/policy/preview'))
    const body = JSON.parse(String(previewCall?.[1]?.body))
    expect(body.grants).toEqual(expect.arrayContaining([
      { operation: 'activity.read', client_id: null, environment: null },
    ]))
  }, 15000)

  it('shows available entities directly when a person has no entity grants', async () => {
    mockGoogleSession([
      { operation: 'access.manage', client_id: null, environment: null },
      { operation: 'qbo.entity.read', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'viewer@example.test', display_name: 'Viewer', role: 'Viewer', status: 'active', issuer: null, sub: null }])
      if (path.endsWith('/access/grants?user_id=user-2')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME' }, { id: 'client-2', name: 'Demo' }])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Viewer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change access for Viewer' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions & entities' }))
    expect(within(dialog).queryByRole('button', { name: 'Add entity access' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /All available entitiesCurrent only/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByRole('button', { name: 'Entity access for Demo' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entity access for ACME' }))
    expect(within(dialog).getByRole('region', { name: 'Access for ACME' })).toHaveTextContent('Read')
    expect(within(dialog).getByRole('button', { name: 'Entity access for Demo' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entity access for ACME' }))
    expect(within(dialog).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'false')
  })

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
    fireEvent.click(within(screen.getByRole('group', { name: /^Role$/ })).getByRole('button', { name: /Viewer/ }))
    expect(screen.queryByText(/unsaved changes?/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('heading', { name: 'Discard your changes?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Change access for Ana' })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Actions & entities' }))
    expect(screen.queryByRole('button', { name: 'Delete user' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Role & sign-in' }))
    expect(screen.getByRole('button', { name: 'Delete user' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }))
    expect(screen.getByText(/Activity history remains available/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete person' })).toBeDisabled()
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/automations/api/access/users/user-2', expect.objectContaining({ method: 'DELETE' }))
    const confirmation = screen.getByRole('textbox', { name: 'Type DELETE to confirm' })
    expect(confirmation).toHaveAttribute('autocomplete', 'off')
    expect(fireEvent.paste(confirmation)).toBe(false)
    expect(fireEvent.drop(confirmation)).toBe(false)
    expect(confirmation).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Delete person' })).toBeDisabled()
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

  it('hides only the signed-in person from People', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'access.manage', client_id: null, environment: null },
      { id: 'grants-grant', operation: 'entities.manage', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/users')) return new Response(JSON.stringify([
        { id: 'user-1', email: 'jorge@example.test', display_name: 'Jorge', role: 'Admin', status: 'active', issuer: 'https://accounts.google.com', sub: 'sub-1' },
        { id: 'user-2', email: 'ana@example.test', display_name: 'Ana', role: 'Operator', status: 'active', issuer: null, sub: null },
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
    expect(within(screen.getByRole('region', { name: 'People' })).queryByText('Jorge')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'People' })).getByText('Ana')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Change access for Jorge' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Account options' })[0])
    fireEvent.click(screen.getByRole('link', { name: 'My account' }))
    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Administration access' })).toHaveTextContent('Manage people')
    expect(screen.getByText('jorge@example.test')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
    fireEvent.focus(screen.getByRole('button', { name: 'About your role' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Your role sets the actions available; the permissions below show where they apply.')
  })

  it('lets a superadmin create another superadmin without individual grants', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const requests: Array<{ path: string; init?: RequestInit }> = []
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: false }, effective_grants: [{ operation: 'access.manage', client_id: null, environment: null }] })
      if (path.endsWith('/access/users')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([])
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = screen.getByRole('dialog', { name: 'Add person' })
    expect(within(dialog).queryByRole('textbox', { name: 'Google email' })).not.toBeInTheDocument()
    fireEvent.click(await within(dialog).findByRole('button', { name: /Superadmin/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to person' }))
    fireEvent.change(await within(dialog).findByRole('textbox', { name: 'Google email' }), { target: { value: 'new-admin@example.test' } })
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

  it.each(['Viewer', 'Operator'] as const)('promotes a paused %s with draft Allow sign-in in one update', async (startingRole) => {
    const requests: Array<{ path: string; init?: RequestInit }> = []
    let promoted = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/session')) return Response.json({ user: { name: 'Founder', email: 'founder@example.test', issuer: 'https://accounts.google.com', sub: 'founder-sub' }, csrf: 'csrf' })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: true }, effective_grants: [] })
      if (path.endsWith('/access/users') && init?.method !== 'POST') return Response.json([{ id: 'user-2', email: 'person@example.test', display_name: 'Person', role: promoted ? 'Admin' : startingRole, status: promoted ? 'active' : 'disabled', issuer: null, sub: null, is_super_admin: promoted, is_super_admin_founder: false }])
      if (path.endsWith('/access/users/user-2') && init?.method === 'PATCH') { promoted = true; return Response.json({ is_super_admin: true, role: 'Admin', status: 'active' }) }
      if (path.includes('/access/grants?user_id=')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([])
      return Response.json({ message: 'Not found' }, { status: 404 })
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Person' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change access for Person' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow sign-in' }))
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Admin/ }))
    const choice = within(dialog).getByRole('dialog', { name: 'Choose admin access' })
    const superadmin = within(choice).getByRole('button', { name: /Superadmin/ })
    expect(superadmin).toBeEnabled()
    fireEvent.click(superadmin)
    const confirmation = within(dialog).getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('Allow sign-in will be applied with Superadmin access.')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Make superadmin' }))
    await waitFor(() => expect(requests.filter((request) => request.path.endsWith('/access/users/user-2') && request.init?.method === 'PATCH')).toHaveLength(1))
    const update = requests.find((request) => request.path.endsWith('/access/users/user-2') && request.init?.method === 'PATCH')
    expect(JSON.parse(String(update?.init?.body))).toEqual({ is_super_admin: true, status: 'active' })
    expect(requests.some((request) => request.path.endsWith('/access/users/user-2/policy') && request.init?.method === 'PUT')).toBe(false)
  })

  it('shows the Founder and other superadmins without letting a non-Founder edit them', async () => {
    let promoted = false
    const requests: Array<{ path: string; init?: RequestInit }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/session')) return Response.json({ user: { name: 'Operator', email: 'operator@example.test', issuer: 'https://accounts.google.com', sub: 'operator-sub' }, csrf: 'csrf' })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: false }, effective_grants: [] })
      if (path.endsWith('/access/users') && init?.method !== 'POST') return Response.json([
        { id: 'user-2', email: 'viewer@example.test', display_name: 'Viewer', role: promoted ? 'Admin' : 'Viewer', status: 'active', issuer: null, sub: null, is_super_admin: promoted, is_super_admin_founder: false },
        { id: 'user-3', email: 'founder@example.test', display_name: 'Founder', role: 'Admin', status: 'active', issuer: null, sub: null, is_super_admin: true, is_super_admin_founder: true },
      ])
      if (path.endsWith('/access/users/user-2') && init?.method === 'PATCH') { promoted = true; return Response.json({ is_super_admin: true, role: 'Admin' }) }
      if (path.includes('/access/grants?user_id=')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([])
      return Response.json({ message: 'Not found' }, { status: 404 })
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('link', { name: 'Change access for Viewer' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'People' })).getByText('founder@example.test')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Change access for Founder' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Change access for Viewer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change access for Viewer' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions & entities' }))
    expect(within(dialog).queryByRole('region', { name: 'Access model' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Role & sign-in' }))
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Admin/ }))
    const choice = within(dialog).getByRole('dialog', { name: 'Choose admin access' })
    expect(within(choice).getAllByRole('button')[0]).toHaveTextContent('Choose entities and administrative permissions.')
    fireEvent.click(within(choice).getAllByRole('button')[0])
    expect(within(dialog).getByRole('button', { name: 'Continue to actions and entities' })).toBeInTheDocument()
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Admin/ }))
    expect(within(dialog).getByRole('dialog', { name: 'Choose admin access' })).toBeInTheDocument()
    fireEvent.click(within(within(dialog).getByRole('dialog', { name: 'Choose admin access' })).getAllByRole('button')[0])
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Viewer/ }))
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Admin/ }))
    fireEvent.click(within(within(dialog).getByRole('dialog', { name: 'Choose admin access' })).getAllByRole('button')[1])
    expect(within(dialog).getByRole('alertdialog')).toHaveTextContent('only the Founder can manage this account')
    expect(within(dialog).queryByRole('region', { name: 'Entity access editor' })).not.toBeInTheDocument()
    fireEvent.click(within(within(dialog).getByRole('alertdialog')).getByRole('button', { name: 'Make superadmin' }))
    await waitFor(() => expect(requests.some((request) => request.path.endsWith('/access/users/user-2') && request.init?.method === 'PATCH')).toBe(true))
    expect(JSON.parse(String(requests.find((request) => request.path.endsWith('/access/users/user-2') && request.init?.method === 'PATCH')?.init?.body))).toEqual({ is_super_admin: true })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Change access for Viewer' })).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'People' })).getByText('Viewer')).toBeInTheDocument()
  })

  it('keeps superadmin demotion pending until new scope is confirmed, and discards on close', async () => {
    let demoted = false
    const requests: Array<{ path: string; init?: RequestInit }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/session')) return Response.json({ user: { name: 'Founder', email: 'founder@example.test', issuer: 'https://accounts.google.com', sub: 'founder-sub' }, csrf: 'csrf' })
      if (path.endsWith('/access/me')) return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: true }, effective_grants: [] })
      if (path.endsWith('/access/users') && init?.method !== 'POST') return Response.json([
        { id: 'user-2', email: 'admin@example.test', display_name: 'Admin', role: 'Admin', status: 'active', issuer: null, sub: null, is_super_admin: !demoted, is_super_admin_founder: false },
      ])
      if (path.endsWith('/access/users/user-2/policy') && init?.method === 'PUT') { demoted = true; return Response.json({ fingerprint: 'policy-1', affected_keys: [], suspended_keys: [], changes: [] }) }
      if (path.includes('/access/grants?user_id=')) return Response.json([])
      if (path.endsWith('/clients')) return Response.json([{ id: 'client-1', name: 'ACME' }, { id: 'client-2', name: 'Demo' }])
      if (path.endsWith('/access/users/user-2/policy/preview')) return Response.json({ fingerprint: 'policy-1', affected_keys: [], suspended_keys: [], changes: [] })
      return Response.json({ message: 'Not found' }, { status: 404 })
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users?edit=user-2']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    const dialog = await screen.findByRole('dialog', { name: 'Superadmin access' })
    expect(within(dialog).getByText('Full access', { exact: false })).toHaveTextContent('current and future entities')
    expect(within(dialog).getAllByText('admin@example.test')).toHaveLength(1)
    const removeAccess = within(dialog).getByRole('button', { name: 'Remove superadmin access' })
    expect(removeAccess).toHaveClass('text-rose-700')
    fireEvent.click(removeAccess)
    expect(within(dialog).getByRole('alertdialog')).toHaveTextContent('Superadmin access remains active until you save.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).getByRole('heading', { name: 'Abandon this access change?' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(within(dialog).getByRole('button', { name: 'Set new access' })).toBeInTheDocument()
    const removeAndSetAccess = within(dialog).getByRole('button', { name: 'Set new access' })
    expect(removeAndSetAccess).toHaveClass('bg-hq-teal')
    expect(removeAndSetAccess).not.toHaveClass('bg-rose-700')
    fireEvent.click(removeAndSetAccess)
    expect(await screen.findByText('Superadmin access stays active until you save the new access.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/unsaved changes?/)).not.toBeInTheDocument()
    expect(demoted).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(within(dialog).getByRole('heading', { name: 'Abandon this access change?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Your new access will not be saved. Superadmin access will remain unchanged.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abandon change' }))
    expect(demoted).toBe(false)
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Admin' }))
    const reopened = await screen.findByRole('dialog', { name: 'Superadmin access' })
    fireEvent.click(within(reopened).getByRole('button', { name: 'Remove superadmin access' }))
    fireEvent.click(within(reopened).getByRole('button', { name: 'Set new access' }))
    const updated = await screen.findByRole('dialog', { name: 'Change access for Admin' })
    expect(await within(updated).findByRole('group', { name: 'Role' })).toBeInTheDocument()
    fireEvent.click(within(within(updated).getByRole('group', { name: 'Role' })).getByRole('button', { name: /Admin/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose admin access' })).getByRole('button', { name: /^Admin/ }))
    expect(within(updated).getByText('1 unsaved change')).toBeInTheDocument()
    fireEvent.click(within(updated).getByRole('button', { name: 'Close' }))
    expect(within(updated).getByRole('heading', { name: 'Abandon this access change?' })).toBeInTheDocument()
    fireEvent.click(within(updated).getByRole('button', { name: 'Keep editing' }))
    fireEvent.click(within(within(updated).getByRole('group', { name: 'Role' })).getByRole('button', { name: /Admin/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose admin access' })).getByRole('button', { name: /Superadmin/ }))
    expect(within(updated).getByRole('group', { name: 'Role' })).toBeInTheDocument()
    expect(within(updated).getByRole('button', { name: 'Role & sign-in' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(updated).queryByText(/unsaved changes?/)).not.toBeInTheDocument()
    expect(within(updated).getByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(within(updated).getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Admin' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Superadmin access' })).getByRole('button', { name: 'Remove superadmin access' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Superadmin access' })).getByRole('button', { name: 'Set new access' }))
    const viewerThenSuperadmin = await screen.findByRole('dialog', { name: 'Change access for Admin' })
    fireEvent.click(within(within(viewerThenSuperadmin).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Viewer/ }))
    expect(within(viewerThenSuperadmin).getByText('1 unsaved change')).toBeInTheDocument()
    expect(within(viewerThenSuperadmin).queryByText('QBO connection will be removed.')).not.toBeInTheDocument()
    expect(within(viewerThenSuperadmin).queryByText('Admin → Viewer')).not.toBeInTheDocument()
    fireEvent.click(within(within(viewerThenSuperadmin).getByRole('group', { name: 'Role' })).getByRole('button', { name: /^Admin/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose admin access' })).getByRole('button', { name: /Superadmin/ }))
    fireEvent.click(within(viewerThenSuperadmin).getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Abandon this access change?')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('link', { name: 'Change access for Admin' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Superadmin access' })).getByRole('button', { name: 'Remove superadmin access' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Superadmin access' })).getByRole('button', { name: 'Set new access' }))
    const updatedAgain = await screen.findByRole('dialog', { name: 'Change access for Admin' })
    fireEvent.click(within(within(updatedAgain).getByRole('group', { name: 'Role' })).getByRole('button', { name: /Operator/ }))
    expect(within(updatedAgain).getByText('1 unsaved change')).toBeInTheDocument()
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Reset role and sign-in' }))
    expect(within(within(updatedAgain).getByRole('group', { name: 'Role' })).getByRole('button', { name: /Admin/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(updatedAgain).getByText('Superadmin access stays active until you save the new access.')).toBeInTheDocument()
    expect(within(updatedAgain).queryByRole('button', { name: 'Reset role and sign-in' })).not.toBeInTheDocument()
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Actions & entities' }))
    expect(within(updatedAgain).queryByRole('button', { name: 'Make superadmin' })).not.toBeInTheDocument()
    expect(within(updatedAgain).queryByRole('button', { name: 'Add entity access' })).not.toBeInTheDocument()
    expect(within(updatedAgain).getByRole('button', { name: /All available entitiesCurrent only/ })).toBeInTheDocument()
    expect(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(updatedAgain).getByRole('button', { name: 'Entity access for Demo' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' }))
    expect(within(updatedAgain).getByRole('region', { name: 'Access for ACME' })).toHaveTextContent('Read')
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Reset actions and entities' }))
    expect(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(updatedAgain).getByRole('button', { name: 'Actions & entities' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(updatedAgain).queryByRole('button', { name: 'Remove superadmin access' })).not.toBeInTheDocument()
    expect(demoted).toBe(false)
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' }))
    expect(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Review changes' }))
    expect(await within(updatedAgain).findByText('Superadmin → Admin')).toBeInTheDocument()
    expect(within(updatedAgain).getByText('1 entity selected. No admin permissions selected.')).toBeInTheDocument()
    expect(within(updatedAgain).getByRole('region', { name: 'Policy impact preview' })).toHaveTextContent('ACME')
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Back to editing' }))
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' }))
    expect(within(updatedAgain).getByRole('button', { name: 'Entity access for ACME' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(updatedAgain).getByRole('button', { name: 'Review changes' })).toBeDisabled()
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Entity access for Demo' }))
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Review changes' }))
    expect(await within(updatedAgain).findByText('Superadmin → Admin')).toBeInTheDocument()
    expect(demoted).toBe(false)
    fireEvent.click(within(updatedAgain).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change access for Admin' })).not.toBeInTheDocument())
    expect(demoted).toBe(true)
    const applied = requests.find((request) => request.path.endsWith('/access/users/user-2/policy') && request.init?.method === 'PUT')
    expect(JSON.parse(String(applied?.init?.body))).toMatchObject({ is_super_admin: false, grants: expect.arrayContaining([{ operation: 'qbo.entity.read', client_id: 'client-2', environment: null }]) })
    expect(requests.some((request) => request.path.endsWith('/access/users/user-2') && request.init?.method === 'PATCH')).toBe(false)
  }, 20000)

  it('requires the typed phrase to transfer Founder status to a bound active superadmin', async () => {
    mockGoogleSession([{ operation: 'access.manage', client_id: null, environment: null }])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    const requests: Array<{ path: string; init?: RequestInit }> = []
    let accessReads = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const path = String(input)
      requests.push({ path, init })
      if (path.endsWith('/access/me')) {
        accessReads += 1
        return Response.json({ user: { id: 'user-1', role: 'Admin', status: 'active', is_super_admin: true, is_super_admin_founder: accessReads > 1 && accessReads < 3 }, effective_grants: [{ operation: 'access.manage', client_id: null, environment: null }] })
      }
      if (path.endsWith('/access/users')) return Response.json([{ id: 'user-2', email: 'next-founder@example.test', display_name: 'Next founder', role: 'Admin', status: 'active', issuer: 'https://accounts.google.com', sub: 'google-sub-2', is_super_admin: true, is_super_admin_founder: false }])
      if (path.endsWith('/founder-transfer') && init?.method === 'POST') return Response.json({ ok: true })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users?edit=user-2']}><AuthProvider><Routes><Route path="/access/users" element={<AccessAdministrationPage />} /></Routes></AuthProvider></MemoryRouter>))
    const dialog = await screen.findByRole('dialog', { name: 'Superadmin access' })
    expect(accessReads).toBeGreaterThanOrEqual(2)
    expect(dialog).toHaveTextContent('next-founder@example.test')
    expect(within(dialog).getByLabelText('Current access')).toHaveTextContent('Full access · current and future entities')
    expect(within(dialog).getByRole('heading', { name: 'Founder ownership' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer Founder status' }))
    expect(within(dialog).getByRole('heading', { name: 'Transfer Founder status' })).toBeInTheDocument()
    expect(within(dialog.querySelector('#founder-transfer-confirmation') as HTMLElement).getByText('next-founder@example.test')).toBeInTheDocument()
    expect(within(dialog).getByText('Loses Founder ownership; keeps full superadmin access.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Remove superadmin access' })).not.toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Confirm transfer' })
    expect(confirm).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel transfer' }))
    expect(within(dialog).queryByRole('button', { name: 'Confirm transfer' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer Founder status' }))
    const reopenedConfirm = within(dialog).getByRole('button', { name: 'Confirm transfer' })
    const confirmationInput = within(dialog).getByLabelText('Type I AM NO LONGER FOUNDER to confirm')
    expect(fireEvent.paste(confirmationInput, { clipboardData: { getData: () => 'I AM NO LONGER FOUNDER' } })).toBe(false)
    expect(fireEvent.drop(confirmationInput, { dataTransfer: { getData: () => 'I AM NO LONGER FOUNDER' } })).toBe(false)
    expect(confirmationInput).toHaveValue('')
    fireEvent.change(confirmationInput, { target: { value: 'I AM NO LONGER FOUNDER' } })
    expect(reopenedConfirm).toBeEnabled()
    fireEvent.click(reopenedConfirm)
    await waitFor(() => expect(requests.some((request) => request.path.endsWith('/founder-transfer'))).toBe(true))
    const transfer = requests.find((request) => request.path.endsWith('/founder-transfer'))
    expect(transfer?.init?.method).toBe('POST')
    expect(JSON.parse(String(transfer?.init?.body))).toEqual({ confirmation: 'I AM NO LONGER FOUNDER' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Superadmin access' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Change access for Next founder' })).not.toBeInTheDocument()
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
