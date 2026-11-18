import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { AccessHomePage } from '../modules/auth/AccessHomePage'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { ClientListPage } from '../modules/qbo/pages/ClientListPage'
import { ClientDetailPage } from '../modules/qbo/pages/ClientDetailPage'
import { AppLayout } from '../layout/AppLayout'
import { RequireClientRead } from '../modules/auth/RequireClientRead'
import { LoginPage } from '../modules/auth/LoginPage'
import { ActivityPage } from '../modules/activity/ActivityPage'
import { RequireActivityRead } from '../modules/auth/RequireActivityRead'
import { AccessAdministrationPage } from '../modules/auth/AccessAdministrationPage'
import { RequireUsersAdmin } from '../modules/auth/RequireUsersAdmin'

afterEach(() => vi.restoreAllMocks())

function mockGoogleSession(grants: object[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input)
    if (path.endsWith('/access/session')) return new Response(JSON.stringify({
      user: { name: 'Jorge', email: 'jorge@example.test', issuer: 'https://accounts.google.com', sub: 'sub-1' }, csrf: 'csrf',
    }), { status: 200 })
    if (path.endsWith('/access/me')) return new Response(JSON.stringify({
      user: { id: 'user-1', role: 'Admin', status: 'active' }, effective_grants: grants,
    }), { status: 200 })
    if (path.endsWith('/access/activity/actors')) return new Response(JSON.stringify(['owner@example.test']), { status: 200 })
    if (path.includes('/access/activity')) return new Response(JSON.stringify({ items: [{
      id: 'evt-1', occurred_at: '2026-11-15T08:00:00Z', reference_id: 'req-1',
      actor: 'owner@example.test', key_name: 'Reporting', client_name: 'Allowed entity', target_name: 'Allowed entity',
      environment: 'prod', action: 'Tried to view QuickBooks data for Allowed entity', category: 'read', status: 'unknown',
    }], next_cursor: null }), { status: 200 })
    if (path.endsWith('/overview')) return new Response(JSON.stringify({
      activeClients: 1, clientGroups: 1, demo: false, connected: 1, disconnected: 0,
      notChecked: 0, unavailable: 0, noCredential: 0, disconnectedClients: [], partial: false,
    }), { status: 200 })
    if (path.includes('/clients/')) return new Response(JSON.stringify({ id: 'client-1', name: 'Allowed entity', status: 'active', client_group: 'group', connections: [] }), { status: 200 })
    if (path.includes('/clients')) return new Response(JSON.stringify([{ id: 'client-1', name: 'Allowed entity', status: 'active', client_group: 'group', connection_state: 'connected' }]), { status: 200 })
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
  })
}

describe('Google governed access', () => {
  it('shows a concise Activity summary and reference only with the explicit global Admin grant', async () => {
    mockGoogleSession([{ id: 'grant-activity', operation: 'activity.read', client_id: null, environment: null }])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => render(<MemoryRouter initialEntries={['/access/activity']}><AuthProvider><Routes>
      <Route element={<AppLayout />}>
        <Route path="/access" element={<AccessHomePage />} />
        <Route element={<RequireActivityRead />}><Route path="/access/activity" element={<ActivityPage />} /></Route>
      </Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getAllByText('Outcome unconfirmed')).toHaveLength(2)
    expect(screen.getByText('via Reporting · Production')).toBeInTheDocument()
    expect(screen.getByText('tried to view QuickBooks data for Allowed entity')).toBeInTheDocument()
    expect(screen.queryByText('api_key_id')).not.toBeInTheDocument()
    expect(screen.queryByText('qbo.account.read')).not.toBeInTheDocument()
    expect(screen.queryByText('503')).not.toBeInTheDocument()
    expect(screen.queryByText('Copy reference ID')).not.toBeInTheDocument()
    expect(screen.getByTitle('Support reference: req-1. Click to copy.')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Copy reference ID/ })))
    expect(writeText).toHaveBeenCalledWith('req-1')
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/access/activity/summary?limit=25&scope=all'), expect.anything())
    expect(screen.getByRole('option', { name: 'All people' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'owner@example.test' })).toBeInTheDocument()
    expect(screen.getByTitle('owner@example.test')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'update' } })
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'owner@example.test' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Filter' })))
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('category=update&actor_email=owner%40example.test'), expect.anything())
  })

  it('does not request Activity for a Google user without activity.read', async () => {
    mockGoogleSession([{ id: 'grant-1', operation: 'client.read', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/access/activity']}><AuthProvider><Routes>
      <Route path="/access" element={<AccessHomePage />} />
      <Route element={<RequireActivityRead />}><Route path="/access/activity" element={<ActivityPage />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('My access')).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { name: 'Financial operations overview' })).toBeInTheDocument()
    expect(screen.getByText('Connected QuickBooks connections')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/overview', expect.anything())
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Clients & Integrations' }))
    expect(await screen.findByText('Allowed entity')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create entity' })).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/clients?connection_status=1', expect.anything())
    fireEvent.click(screen.getByRole('link', { name: 'Allowed entity' }))
    expect(await screen.findByRole('heading', { name: 'Entity detail' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate entity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete entity' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reconnect QuickBooks')).not.toBeInTheDocument()
  })

  it('does not load clients without a client.read grant, even for an Admin', async () => {
    mockGoogleSession([{ id: 'grant-1', operation: 'users.admin', client_id: null, environment: null }])
    await act(async () => render(<MemoryRouter initialEntries={['/qbo/clients']}><AuthProvider><Routes>
      <Route path="/" element={<AccessHomePage />} />
      <Route element={<RequireClientRead />}><Route path="/qbo/clients" element={<ClientListPage readOnly />} /></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByText('My access')).toBeInTheDocument()
    expect(screen.getByText('users.admin')).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/clients'), expect.anything())
  })

  it('lets an Admin preauthorize a Google email and assign a scoped grant', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'users.admin', client_id: null, environment: null },
      { id: 'grants-grant', operation: 'grants.admin', client_id: null, environment: null },
      { id: 'client-grant', operation: 'client.read', client_id: null, environment: null },
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
      if (path.includes('/access/grants')) return new Response(JSON.stringify(init?.method === 'POST' ? { id: 'new-grant' } : []), { status: init?.method === 'POST' ? 201 : 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes>
      <Route element={<AppLayout />}><Route element={<RequireUsersAdmin />}>
        <Route path="/access/users" element={<AccessAdministrationPage />} />
      </Route></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'People and access' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Google email'), { target: { value: 'ana@example.test' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Operator' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/Awaiting first sign-in/)).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/access/users', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'ana@example.test', role: 'Operator' }),
    }))
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'client.update' } })
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'client-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add grant' }))
    await screen.findByText('Permission granted.')
    expect(globalThis.fetch).toHaveBeenCalledWith('/automations/api/access/grants', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ user_id: 'new-user', operation: 'client.update', client_id: 'client-1', environment: null }),
    }))
  })

  it('does not offer self-demotion or self-disable in People and access', async () => {
    mockGoogleSession([
      { id: 'users-grant', operation: 'users.admin', client_id: null, environment: null },
      { id: 'grants-grant', operation: 'grants.admin', client_id: null, environment: null },
    ])
    const baseFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access/users')) return new Response(JSON.stringify([
        { id: 'user-1', email: 'jorge@example.test', display_name: 'Jorge', role: 'Admin', status: 'active', issuer: 'https://accounts.google.com', sub: 'sub-1' },
      ]), { status: 200 })
      if (String(input).includes('/access/grants')) return new Response('[]', { status: 200 })
      return baseFetch(input, init)
    })
    await act(async () => render(<MemoryRouter initialEntries={['/access/users']}><AuthProvider><Routes>
      <Route element={<AppLayout />}><Route element={<RequireUsersAdmin />}>
        <Route path="/access/users" element={<AccessAdministrationPage />} />
      </Route></Route>
    </Routes></AuthProvider></MemoryRouter>))
    expect(await screen.findByRole('heading', { name: 'People and access' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role for jorge@example.test' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled()
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
    expect(screen.getByText('This Google account does not have access to FinOps. Ask an administrator to authorize it.')).toBeInTheDocument()
  })
})
