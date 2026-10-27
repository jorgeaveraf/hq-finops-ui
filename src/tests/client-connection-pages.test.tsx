import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, it, vi } from 'vitest'
import { ClientListPage } from '../modules/qbo/pages/ClientListPage'
import { ClientDetailPage } from '../modules/qbo/pages/ClientDetailPage'
import { ReconnectButton } from '../modules/qbo/components/ReconnectButton'

const id = '477751f2-1142-4283-a3c0-387f8aa45fbd'
const summary = { id, name: 'Sample client A', client_group: 'sample_group', status: 'active', metadata: { tier: 'sandbox' }, environments: ['sandbox'] }
const detail = {
  ...summary,
  created_at: '2025-11-06T03:49:05.703363Z',
  connections: [{ environment: 'sandbox', is_connected: true, connection_checked_at: '2026-10-21T22:49:48.091203Z', realm_id: '9341455571857172' }],
}
const disconnected = {
  ...summary,
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Sample client B',
}
const unchecked = {
  ...summary,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Sample client C',
  client_group: 'another_group',
}
const unavailable = {
  ...summary,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Sample client D',
  client_group: null,
}
const noCredential = {
  ...summary,
  id: '00000000-0000-4000-8000-000000000004',
  name: 'Sample client E',
  environments: [],
}

afterEach(() => vi.restoreAllMocks())

function chooseFilter(label: string, option: string) {
  if (label === 'Created' || label === 'QuickBooks connection') {
    const more = screen.getByRole('button', { name: /More filters/ })
    if (more.getAttribute('aria-expanded') === 'false') fireEvent.click(more)
  }
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} `) }))
  fireEvent.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }))
}

function mockAuthWindow() {
  const replace = vi.fn()
  const close = vi.fn()
  vi.spyOn(window, 'open').mockReturnValue({ location: { replace }, close, opener: window } as unknown as Window)
  return { replace, close }
}

describe('FinOps client connection display', () => {
  it('opens exactly the HTTPS authorization URL returned by the gateway', async () => {
    const popup = mockAuthWindow()
    const gatewayUrl = 'https://appcenter.intuit.com/connect/oauth2?state=fixture'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      client_id: id, environment: 'sandbox', redirect_url: gatewayUrl,
    }), { status: 200 }))
    render(<ReconnectButton clientId={id} environment="sandbox" mode="connect" />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect QuickBooks' }))
    await waitFor(() => expect(popup.replace).toHaveBeenCalledWith(gatewayUrl))
    expect(screen.getByRole('status')).toHaveTextContent('QuickBooks opened in a new tab')
  })

  it('rejects a local mock authorization URL even when marked as mock', async () => {
    const popup = mockAuthWindow()
    const localUrl = `${window.location.origin}/automations/qbo/clients/${id}/mock-authorize`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      client_id: id, environment: 'sandbox', redirect_url: localUrl, mock: true,
    }), { status: 200 }))
    render(<ReconnectButton clientId={id} environment="sandbox" mode="connect" />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect QuickBooks' }))
    expect(await screen.findByText('The QuickBooks authorization link is invalid.')).toBeInTheDocument()
    expect(popup.close).toHaveBeenCalledTimes(1)
  })

  it('keeps authorization primary and reloads saved status from the detail endpoint', async () => {
    const popup = mockAuthWindow()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/reconnect?')
        ? { client_id: id, environment: 'sandbox', redirect_url: 'https://example.com/authorize' }
        : detail,
    ), { status: 200 }))
    render(
      <MemoryRouter initialEntries={[`/qbo/clients/${id}`]}>
        <Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    const reload = await screen.findByRole('button', { name: 'Reload saved status' })
    expect(screen.getByText('Sample Group', { selector: 'span' })).toHaveClass('rounded-full', 'w-max', 'whitespace-nowrap')
    expect(screen.getByText('Entity ID').parentElement).toHaveTextContent(id)
    fireEvent.click(screen.getByText('Technical details', { selector: 'span' }))
    expect(screen.getByText('Realm ID').parentElement).toHaveTextContent('9341455571857172')
    fireEvent.click(screen.getByText('Reconnect QuickBooks', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect QuickBooks' }))
    await waitFor(() => expect(popup.replace).toHaveBeenCalledWith('https://example.com/authorize'))
    expect(screen.queryByRole('link', { name: 'Open QuickBooks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument()
    now.mockReturnValue(3000)
    fireEvent.focus(window)
    expect(await screen.findByText('Saved status reloaded.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith(`/clients/${id}`))).toHaveLength(2)
    expect(reload).toBeEnabled()
  })

  it('opens an unavailable deep link with the connection filter applied', async () => {
    const missing = { ...summary, id: '00000000-0000-4000-8000-000000000099', name: 'Needs verification', client_group: null }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [{ ...summary, connection_state: 'connected' }, { ...missing, connection_state: 'unavailable' }]
        : String(input).endsWith(`/${missing.id}`) ? { ...missing, connections: [] } : detail,
    ), { status: 200 }))
    render(<MemoryRouter initialEntries={['/qbo/clients?connection=unavailable']}><ClientListPage /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Needs verification' })
    expect(screen.getByRole('button', { name: /More filters/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'QuickBooks connection Unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sample client A' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('button', { name: 'QuickBooks connection All connection states' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sample client A' })).toBeInTheDocument()
  })

  it('offers the first QuickBooks connection from the saved sandbox tier without a credential', async () => {
    const popup = mockAuthWindow()
    const fresh = { ...summary, environments: [], connections: [] }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/reconnect?')
        ? { client_id: id, environment: 'sandbox', redirect_url: 'https://example.com/authorize' }
        : fresh,
    ), { status: 200 }))
    render(<MemoryRouter initialEntries={[`/qbo/clients/${id}`]}><Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByText('Connect QuickBooks', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect QuickBooks' }))
    await waitFor(() => expect(popup.replace).toHaveBeenCalledWith('https://example.com/authorize'))
    expect(screen.queryByRole('link', { name: 'Open QuickBooks' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes(`/clients/${id}/reconnect?environment=sandbox`))).toBe(true)
  })

  it('closes the empty tab and keeps the entity page when preparing authorization fails', async () => {
    const popup = mockAuthWindow()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).includes('/reconnect?')
      ? new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: 503 })
      : new Response(JSON.stringify({ ...summary, connections: [] }), { status: 200 }))
    render(<MemoryRouter initialEntries={[`/qbo/clients/${id}`]}><Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByText('Connect QuickBooks', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect QuickBooks' }))
    expect(await screen.findByText('Gateway unavailable')).toBeInTheDocument()
    expect(popup.close).toHaveBeenCalledTimes(1)
    expect(popup.replace).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Open QuickBooks' })).not.toBeInTheDocument()
  })

  it('offers a manual link only when the browser blocks the authorization tab', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/reconnect?')
        ? { client_id: id, environment: 'sandbox', redirect_url: 'https://example.com/authorize' }
        : { ...summary, connections: [] },
    ), { status: 200 }))
    render(<MemoryRouter initialEntries={[`/qbo/clients/${id}`]}><Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByText('Connect QuickBooks', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect QuickBooks' }))
    expect(await screen.findByRole('link', { name: 'Open QuickBooks' })).toHaveAttribute('href', 'https://example.com/authorize')
  })

  it('sorts client groups and their entities by name or creation date', async () => {
    const older = { ...summary, id: '00000000-0000-4000-8000-000000000020', name: 'Zulu entity', client_group: 'alpha_group', created_at: '2026-01-01T12:00:00Z' }
    const newer = { ...summary, id: '00000000-0000-4000-8000-000000000021', name: 'Alpha entity', client_group: 'alpha_group', created_at: '2026-03-01T12:00:00Z' }
    const middle = { ...summary, id: '00000000-0000-4000-8000-000000000022', name: 'Middle entity', client_group: 'zulu_group', created_at: '2026-02-01T12:00:00Z' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [older, newer, middle].map((entity) => ({ ...entity, connection_state: 'unavailable' })) : { ...detail, connections: [] },
    ), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Middle entity' })
    const names = () => within(screen.getByRole('list', { name: 'Entities by client' })).getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(names()).toEqual(['Alpha Group, 2 entities', 'Zulu Group, 1 entity'])
    chooseFilter('Sort by', 'Client name Z–A')
    expect(names()).toEqual(['Zulu Group, 1 entity', 'Alpha Group, 2 entities'])
    chooseFilter('Sort by', 'Newest created')
    expect(names()).toEqual(['Alpha Group, 2 entities', 'Zulu Group, 1 entity'])
    const alphaGroup = screen.getByRole('list', { name: 'Alpha Group entities' })
    expect(within(alphaGroup).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['Alpha entity', 'Zulu entity'])
    chooseFilter('Sort by', 'Oldest created')
    expect(names()).toEqual(['Alpha Group, 2 entities', 'Zulu Group, 1 entity'])
    expect(within(alphaGroup).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['Zulu entity', 'Alpha entity'])
  })

  it('starts long hierarchies collapsed and searches entity and client names', async () => {
    const entities = Array.from({ length: 17 }, (_, index) => ({
      ...summary,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: index === 9 ? 'Payroll East' : `Entity ${index + 1}`,
      client_group: `client_${String(index + 1).padStart(2, '0')}`,
      connection_state: 'unavailable',
    }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(entities), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    expect(await screen.findByText('17 entities')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client 01, 1 entity' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Payroll East' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Payroll' } })
    expect(screen.getByRole('button', { name: 'Client 10, 1 entity' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Payroll East' })).toBeInTheDocument()
    expect(screen.getByText('1 of 17 entities')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Client 05' } })
    expect(screen.getByRole('link', { name: 'Entity 5' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('groups entities under expandable clients and searches client names and unassigned records', async () => {
    const another = { ...summary, id: '00000000-0000-4000-8000-000000000010', name: 'Sample client B' }
    const legacy = { ...summary, id: '00000000-0000-4000-8000-000000000011', name: 'Legacy entity', client_group: null }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [summary, another, legacy].map((entity) => ({ ...entity, connection_state: 'connected' })) : { ...detail, id: String(input).split('/').at(-1) },
    ), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Legacy entity' })).toBeInTheDocument()
    const groups = screen.getByRole('list', { name: 'Entities by client' })
    expect(within(groups).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Sample Group, 2 entities' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'No client assigned, 1 entity' })).toBeInTheDocument()
    const firstEntity = screen.getByRole('link', { name: 'Sample client A' })
    expect(firstEntity).not.toHaveTextContent('Sample Group')
    expect(screen.getByRole('link', { name: 'Legacy entity' })).not.toHaveTextContent('No client assigned')
    fireEvent.click(screen.getByRole('button', { name: 'Sample Group, 2 entities' }))
    expect(screen.getByRole('button', { name: 'Sample Group, 2 entities' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Sample client A' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sample Group, 2 entities' }))
    expect(screen.getByRole('link', { name: 'Sample client A' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sample Group, 2 entities' }))
    expect(screen.queryByRole('button', { name: /^Client All clients$/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Sample Group' } })
    expect(screen.getByRole('button', { name: 'Sample Group, 2 entities' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Sample Group, 2 entities' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sample client A' })).toHaveAttribute('href', `/qbo/clients/${id}`)
    expect(screen.getByRole('link', { name: 'Sample client B' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Legacy entity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No client assigned, 1 entity' })).not.toBeInTheDocument()
    expect(screen.getByText('2 of 3 entities')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'No client assigned' } })
    expect(screen.getByRole('link', { name: 'Legacy entity' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sample client A' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No client assigned, 1 entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('link', { name: 'Sample client A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  }, 10000)

  it('filters by insertion date, including an inclusive custom day', async () => {
    const recent = { ...summary, created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), connection_state: 'connected' }
    const older = { ...summary, id: '00000000-0000-4000-8000-000000000030', name: 'Older entity', created_at: '2025-01-15T12:00:00Z', connection_state: 'unavailable' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([recent, older]), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Older entity' })
    chooseFilter('Created', 'Last 7 days')
    expect(screen.getByRole('link', { name: 'Sample client A' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Older entity' })).not.toBeInTheDocument()
    chooseFilter('Created', 'Custom range')
    expect(screen.queryByRole('link', { name: 'Older entity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Created Last 7 days' })).toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    chooseFilter('Created', 'Custom range')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-01-15' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-01-15' } })
    expect(screen.queryByRole('link', { name: 'Older entity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(screen.getByRole('link', { name: 'Older entity' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sample client A' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Created Jan 15, 2025/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('link', { name: 'Sample client A' })).toBeInTheDocument()
  })

  it('shows the saved state without environment or review time in the list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      return new Response(JSON.stringify(path.includes('/clients?connection_status=1') ? [{ ...summary, connection_state: 'connected' }] : detail), { status: 200 })
    })
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    const cards = await screen.findByRole('list', { name: 'Entities by client' })
    expect((await within(cards).findAllByText('Connected')).length).toBeGreaterThan(0)
    expect(screen.queryByText('sandbox: Connected')).not.toBeInTheDocument()
    expect(screen.queryByText(/21\/10\/2026/)).not.toBeInTheDocument()
    expect(screen.queryByText('No review recorded')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reconnect QuickBooks' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sample client A' })).toHaveAttribute('href', `/qbo/clients/${id}`)
    fireEvent.click(screen.getByRole('button', { name: /More filters/ }))
    expect(screen.getByRole('button', { name: 'QuickBooks connection All connection states' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sample Group, 1 entity' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByText('Status:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    const infoButton = screen.getByRole('button', { name: 'About this entity list' })
    fireEvent.focus(infoButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Search entities and clients, or filter by creation date and QuickBooks connection.')
    fireEvent.blur(infoButton)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows an inactive client as an exception without confusing it with connection state', async () => {
    const inactive = { ...summary, id: '00000000-0000-4000-8000-000000000005', name: 'Sample client F', status: 'inactive' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [summary, inactive].map((entity) => ({ ...entity, connection_state: 'connected' })) : { ...detail, id: inactive.id, connections: detail.connections },
    ), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    expect(await screen.findByText('Inactive entity')).toBeInTheDocument()
    expect(screen.queryByText('Status: Active')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Connected')).toHaveLength(2))
  })

  it('places the saved review in client detail and keeps reconnect secondary', async () => {
    const popup = mockAuthWindow()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/reconnect?')
        ? { client_id: id, environment: 'sandbox', redirect_url: 'https://example.com/authorize' }
        : detail,
    ), { status: 200 }))
    render(
      <MemoryRouter initialEntries={[`/qbo/clients/${id}`]}>
        <Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText('Connected')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument()
    expect(screen.getByText('Reconnect QuickBooks', { selector: 'summary' })).toHaveClass('hover:bg-hq-teal/5')
    expect(screen.getByRole('heading', { name: 'Sample client A' })).toBeInTheDocument()
    expect(screen.getByText('Active entity')).toBeInTheDocument()
    expect(screen.getByText('Sample Group', { selector: 'span' })).toHaveClass('rounded-full', 'w-max', 'whitespace-nowrap')
    const connectionInfo = screen.getByRole('button', { name: 'About QuickBooks connection' })
    fireEvent.focus(connectionInfo)
    expect(screen.getByRole('tooltip')).toHaveTextContent('QuickBooks connection status and authorization options for this entity.')
    fireEvent.blur(connectionInfo)
    expect(screen.queryByText(/credential review/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Client details' })).not.toBeInTheDocument()
    expect(screen.getByText('QuickBooks environment')).toBeInTheDocument()
    expect(screen.getByText('Entity ID').parentElement).toHaveTextContent(id)
    expect(screen.getByText('sandbox')).toBeInTheDocument()
    const technicalDetails = screen.getByText('Technical details').closest('details')
    expect(technicalDetails).not.toHaveAttribute('open')
    expect(within(technicalDetails as HTMLElement).getByText('Realm ID').parentElement).toHaveTextContent('9341455571857172')
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText(new Date(detail.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }))).toBeInTheDocument()
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.queryByText('Collapsed')).not.toBeInTheDocument()
    expect(screen.queryByText('Show technical payload')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete entity' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reconnect QuickBooks', { selector: 'summary' }))
    expect(screen.getByRole('button', { name: 'Reconnect QuickBooks' })).toBeInTheDocument()
    expect(screen.queryByText('Continue reconnect')).not.toBeInTheDocument()
    expect(screen.queryByText('Reconnect QuickBooks from Sample client A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect QuickBooks' }))
    await waitFor(() => expect(popup.replace).toHaveBeenCalledWith('https://example.com/authorize'))
    expect(screen.queryByRole('link', { name: 'Open QuickBooks' })).not.toBeInTheDocument()
  })

  it('shows an unchecked credential as unknown in the detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ...detail,
      connections: [{ ...detail.connections[0], is_connected: false, connection_checked_at: null }],
    }), { status: 200 }))
    render(
      <MemoryRouter initialEntries={[`/qbo/clients/${id}`]}>
        <Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0)
    expect(screen.getByText('Reason: Not checked')).toBeInTheDocument()
    expect(screen.getByText(/No review recorded/)).toBeInTheDocument()
  })

  it('shows three connection labels without calling missing data a reconnection', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/clients?connection_status=1')) {
        return new Response(JSON.stringify([
          { ...disconnected, connection_state: 'reconnect-needed' },
          { ...unchecked, connection_state: 'unavailable' },
          { ...unavailable, connection_state: 'unavailable' },
        ]), { status: 200 })
      }
      if (path.endsWith(`/${unavailable.id}`)) {
        return new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: 502 })
      }
      const client = path.endsWith(`/${disconnected.id}`) ? disconnected : unchecked
      return new Response(JSON.stringify({
        ...client,
        connections: [{
          environment: 'sandbox',
          is_connected: false,
          connection_checked_at: client === disconnected ? '2026-10-21T22:49:48.091203Z' : null,
          realm_id: null,
        }],
      }), { status: 200 })
    })
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    await screen.findByRole('list', { name: 'Entities by client' })
    expect(await screen.findByText('Reconnect needed')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(screen.getAllByText('Reconnect needed')).toHaveLength(1)
  })

  it('combines client search and connection filters without treating an error as disconnected', async () => {
    const unassignedNoCredential = { ...noCredential, client_group: null }
    const entities = [summary, disconnected, unchecked, unavailable, unassignedNoCredential]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.includes('/clients?connection_status=1')) return new Response(JSON.stringify(entities.map((entity) => ({
        ...entity,
        connection_state: entity.id === unavailable.id ? 'unavailable'
          : entity.id === unassignedNoCredential.id || entity.id === unchecked.id ? 'unavailable'
            : entity.id === disconnected.id ? 'reconnect-needed' : 'connected',
      }))), { status: 200 })
      if (path.endsWith(`/${unavailable.id}`)) return new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: 502 })
      const entity = entities.find((row) => path.endsWith(`/${row.id}`))!
      if (entity.id === unassignedNoCredential.id) return new Response(JSON.stringify({ ...entity, connections: [] }), { status: 200 })
      return new Response(JSON.stringify({
        ...entity,
        connections: [{ environment: 'sandbox', realm_id: null,
          is_connected: entity.id !== disconnected.id,
          connection_checked_at: entity.id === unchecked.id ? null : '2026-10-21T22:49:48Z',
        }],
      }), { status: 200 })
    })
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /More filters/ }))
    const connectionSelect = await screen.findByRole('button', { name: 'QuickBooks connection All connection states' })
    await waitFor(() => expect(connectionSelect).not.toBeDisabled())
    fireEvent.click(connectionSelect)
    expect(within(screen.getByRole('listbox', { name: 'QuickBooks connection' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Connected', 'Reconnect needed', 'Unavailable',
    ])
    expect(screen.queryByRole('option', { name: 'All connection states' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Connected' }), { key: 'Escape' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'Sample Group' } })
    chooseFilter('QuickBooks connection', 'Reconnect needed')
    expect(screen.getByRole('link', { name: 'Sample client B' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sample client A' })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 5 entities')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'No client assigned' } })
    expect(screen.getByText('No entities match these filters.')).toBeInTheDocument()
    chooseFilter('QuickBooks connection', 'Unavailable')
    expect(screen.getByRole('link', { name: 'Sample client D' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sample client E' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('starts with select range and offers only the global clear action', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [summary, unchecked].map((entity) => ({ ...entity, connection_state: 'connected' })) : { ...detail, id: String(input).split('/').at(-1) },
    ), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    await screen.findByRole('list', { name: 'Entities by client' })
    fireEvent.click(screen.getByRole('button', { name: /More filters/ }))
    expect(await screen.findByRole('button', { name: 'Created Select range' })).toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Created Select range' }))
    expect(within(screen.getByRole('listbox', { name: 'Created' })).getAllByRole('option').at(-1)).toHaveTextContent('Custom range')
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Created' }), { key: 'Escape' })
    chooseFilter('Created', 'Last 7 days')
    expect(screen.queryByRole('button', { name: 'Clear Created filter' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Clear/i })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('button', { name: 'Created Select range' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('ignores an incomplete custom range in a saved URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([summary]), { status: 200 }))
    render(<MemoryRouter initialEntries={['/automations/qbo/clients?created=custom']}><ClientListPage /></MemoryRouter>)
    await screen.findByRole('list', { name: 'Entities by client' })
    fireEvent.click(screen.getByRole('button', { name: /More filters/ }))
    expect(screen.getByRole('button', { name: 'Created Select range' })).toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
  })

  it('summarizes an applied custom range without persistent date fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([summary]), { status: 200 }))
    render(<MemoryRouter initialEntries={['/automations/qbo/clients?created=custom&from=2025-10-01&to=2025-10-29']}><ClientListPage /></MemoryRouter>)
    await screen.findByText('No entities match these filters.')
    expect(screen.getByRole('button', { name: 'Created Oct 1–29, 2025' })).toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
  })

  it('does not allow future dates in a custom creation range', async () => {
    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const dateText = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([summary]), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    await screen.findByRole('list', { name: 'Entities by client' })
    chooseFilter('Created', 'Custom range')
    expect(screen.getByLabelText('From')).toHaveAttribute('max', dateText(today))
    expect(screen.getByLabelText('To')).toHaveAttribute('max', dateText(today))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-01-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: dateText(tomorrow) } })
    expect(screen.getByText('Dates cannot be in the future.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply range' })).toBeDisabled()
  })

  it('caps a future custom URL date at today', async () => {
    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const dateText = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    function Query() { return <output data-testid="current-query">{useLocation().search}</output> }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([summary]), { status: 200 }))
    render(<MemoryRouter initialEntries={[`/automations/qbo/clients?created=custom&from=2025-01-01&to=${dateText(tomorrow)}`]}><ClientListPage /><Query /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('current-query')).toHaveTextContent(`to=${dateText(today)}`))
    expect(screen.getByRole('button', { name: /Created Jan 1, 2025/ })).toHaveTextContent(new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(today))
  })

  it('does not show disconnected when loading the whole client list fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: 502 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    expect(await screen.findByText('Unable to load entities')).toBeInTheDocument()
    expect(screen.queryByText(/Disconnected/)).not.toBeInTheDocument()
    expect(screen.queryByText('No entities found')).not.toBeInTheDocument()
  })

  it('shows no credential instead of not checked for tier-only metadata in the list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
      String(input).includes('/clients?connection_status=1') ? [{ ...noCredential, connection_state: 'unavailable' }] : { ...noCredential, connections: [] },
    ), { status: 200 }))
    render(<MemoryRouter><ClientListPage /></MemoryRouter>)
    const cards = await screen.findByRole('list', { name: 'Entities by client' })
    expect((await within(cards).findAllByText('Unavailable')).length).toBeGreaterThan(0)
    expect(within(cards).queryByText(/Not checked/)).not.toBeInTheDocument()
  })

  it('shows no credential instead of not checked for tier-only metadata in the detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ...noCredential,
      connections: [],
    }), { status: 200 }))
    render(
      <MemoryRouter initialEntries={[`/qbo/clients/${noCredential.id}`]}>
        <Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0)
    expect(screen.getByText('Reason: No credential')).toBeInTheDocument()
    expect(screen.queryByText(/Not checked/)).not.toBeInTheDocument()
  })

  it('does not call a failed detail lookup a missing client or disconnected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: 'Gateway unavailable',
    }), { status: 502 }))
    render(
      <MemoryRouter initialEntries={[`/qbo/clients/${unavailable.id}`]}>
        <Routes><Route path="/qbo/clients/:clientId" element={<ClientDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Gateway unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Entity not found.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Disconnected/)).not.toBeInTheDocument()
  })
})
