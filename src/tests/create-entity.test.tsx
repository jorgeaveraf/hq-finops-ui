import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateClientPage } from '../modules/qbo/pages/CreateClientPage'
import { ClientListPage } from '../modules/qbo/pages/ClientListPage'

const entityId = '00000000-0000-4000-8000-000000000010'
const existing = [
  { id: entityId, name: 'Nova Farms Maine', client_group: 'nova_farms', status: 'active', metadata: { tier: 'sandbox' }, environments: ['sandbox'] },
  { id: '00000000-0000-4000-8000-000000000011', name: 'Nova Farms Massachusetts', client_group: 'nova_farms', status: 'active', metadata: { tier: 'sandbox' }, environments: ['sandbox'] },
  { id: '00000000-0000-4000-8000-000000000012', name: 'Legacy entity', client_group: null, status: 'active', metadata: { tier: 'sandbox' }, environments: ['sandbox'] },
]

afterEach(() => vi.restoreAllMocks())

function renderForm() {
  render(
    <MemoryRouter initialEntries={['/qbo/clients/new']}>
      <Routes>
        <Route path="/qbo/clients" element={<ClientListPage />}>
          <Route path="new" element={<CreateClientPage />} />
        </Route>
        <Route path="/qbo/clients/:clientId" element={<p>Created entity detail</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockClients(onCreate?: (payload: Record<string, unknown>) => void) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/clients') && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body))
      onCreate?.(payload)
      return new Response(JSON.stringify({ ...existing[0], ...payload, id: entityId }), { status: 201 })
    }
    return new Response(JSON.stringify(String(input).includes('/clients?connection_status=1') ? existing.map((entity) => ({ ...entity, connection_state: 'unavailable' })) : { ...existing[0], connections: [] }), { status: 200 })
  })
}

function choose(label: string, option: string) {
  const dialog = screen.getByRole('dialog', { name: 'Create entity' })
  fireEvent.click(within(dialog).getByRole('button', { name: `${label} ${label === 'Client' ? 'Select a client' : 'Select environment'}` }))
  fireEvent.click(within(dialog).getByRole('option', { name: option }))
}

describe('create entity modal', () => {
  it('uses a focused modal and excludes placeholders from dropdown options', async () => {
    mockClients()
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(within(dialog).getByRole('heading', { name: 'Create entity' })).toHaveFocus()
    expect(within(dialog).queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'About creating an entity' }))
    expect(within(dialog).getByRole('tooltip')).toHaveTextContent('Add a QuickBooks entity under a client.')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(dialog).queryByRole('tooltip')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Advanced options').closest('details')).not.toHaveAttribute('open')
    const clientTrigger = await within(dialog).findByRole('button', { name: 'Client Select a client' })
    await waitFor(() => expect(clientTrigger).not.toBeDisabled())
    expect(clientTrigger).toHaveClass('hover:bg-hq-teal/5')
    expect(within(dialog).getByRole('textbox', { name: 'Entity name' })).toHaveClass('hover:bg-hq-teal/5')
    expect(within(dialog).getByRole('button', { name: 'Environment Select environment' })).toHaveClass('hover:bg-hq-teal/5')
    expect(within(dialog).getByText('Advanced options').closest('details')).toHaveClass('hover:bg-hq-teal/5')
    fireEvent.click(clientTrigger)
    const options = within(dialog).getByRole('listbox', { name: 'Client' })
    expect(options.parentElement).toBe(dialog)
    expect(options.querySelector('.overflow-y-auto')).toHaveClass('overscroll-contain')
    expect(within(options).queryByRole('option', { name: 'Select a client' })).not.toBeInTheDocument()
    expect(within(options).getAllByRole('option', { name: 'Nova Farms' })).toHaveLength(1)
    expect(within(options).getByRole('option', { name: 'Create a new client' }).parentElement).toHaveClass('border-t')
    fireEvent.click(within(options).getByRole('option', { name: 'Nova Farms' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Environment Select environment' }))
    expect(within(dialog).queryByRole('option', { name: 'Select environment' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('sends the selected client group and navigates by entity UUID', async () => {
    let submitted: Record<string, unknown> | null = null
    mockClients((payload) => { submitted = payload })
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Client Select a client' })).not.toBeDisabled())
    choose('Client', 'Nova Farms')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Entity name' }), { target: { value: 'Nova Farms New Jersey' } })
    choose('Environment', 'Sandbox')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create entity' }))
    expect(await screen.findByText('Created entity detail')).toBeInTheDocument()
    expect(submitted).toMatchObject({ name: 'Nova Farms New Jersey', client_group: 'nova_farms', metadata: { tier: 'sandbox' } })
    expect(submitted).not.toHaveProperty('client_id')
  })

  it('requires a new client name and rejects a duplicate key without losing input', async () => {
    const posted: Record<string, unknown>[] = []
    mockClients((payload) => posted.push(payload))
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Client Select a client' })).not.toBeDisabled())
    choose('Client', 'Create a new client')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Client name' }), { target: { value: 'Nova Farms' } })
    fireEvent.blur(within(dialog).getByRole('textbox', { name: 'Client name' }))
    expect(within(dialog).getByText('This client already exists. Select it from the list instead.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Entity name' }), { target: { value: 'Nova Farms Connecticut' } })
    choose('Environment', 'Sandbox')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create entity' }))
    expect(await within(dialog).findByText('This client already exists. Select it from the list instead.')).toBeInTheDocument()
    expect(posted).toHaveLength(0)
    expect(within(dialog).getByRole('textbox', { name: 'Entity name' })).toHaveValue('Nova Farms Connecticut')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Client name' }), { target: { value: 'New Demo Group' } })
    expect(within(dialog).queryByText(/Entities under this client appear together/)).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create entity' }))
    expect(await screen.findByText('Created entity detail')).toBeInTheDocument()
    expect(posted[0].client_group).toBe('new_demo_group')
  })

  it('rejects an existing entity name in the same client and environment before posting', async () => {
    const posted: Record<string, unknown>[] = []
    mockClients((payload) => posted.push(payload))
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Client Select a client' })).not.toBeDisabled())
    choose('Client', 'Nova Farms')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Entity name' }), { target: { value: ' nova farms   maine ' } })
    choose('Environment', 'Sandbox')
    fireEvent.blur(within(dialog).getByRole('textbox', { name: 'Entity name' }))
    expect(within(dialog).getByText('An entity with this name already exists under this client and environment.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create entity' }))
    expect(within(dialog).getByText('An entity with this name already exists under this client and environment.')).toBeInTheDocument()
    expect(posted).toHaveLength(0)
  })

  it('closes on Cancel and returns to the list', async () => {
    mockClients()
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'QuickBooks Online entities' })).toBeInTheDocument()
  })

  it('reuses the parent entity request while the create dialog is open', async () => {
    mockClients()
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Client Select a client' })).not.toBeDisabled())
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).includes('/clients?connection_status=1'))).toHaveLength(1)
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => /\/clients\/[0-9a-f-]{36}$/.test(String(input)))).toBe(false)
  })

  it('offers a working retry when clients fail to load', async () => {
    let attempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      attempts += 1
      return attempts === 1
        ? new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: 503 })
        : new Response(JSON.stringify(existing.map((entity) => ({ ...entity, connection_state: 'unavailable' }))), { status: 200 })
    })
    renderForm()
    const dialog = screen.getByRole('dialog', { name: 'Create entity' })
    expect(await within(dialog).findByText('Clients unavailable')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create entity' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Client Select a client' })).not.toBeDisabled())
    expect(attempts).toBe(2)
  })
})
