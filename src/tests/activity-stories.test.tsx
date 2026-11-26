import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ActivityPage } from '../modules/activity/ActivityPage'
import { ActivityPersonFilter } from '../modules/activity/ActivityPersonFilter'
import { ActivityDateFilter } from '../modules/activity/ActivityDateFilter'

const originalShowModal = HTMLDialogElement.prototype.showModal
const originalClose = HTMLDialogElement.prototype.close
afterEach(() => {
  vi.restoreAllMocks()
  HTMLDialogElement.prototype.showModal = originalShowModal
  HTMLDialogElement.prototype.close = originalClose
})

it('keeps a long person list scrollable and lets the last email be selected', () => {
  const onChange = vi.fn()
  const actors = Array.from({ length: 40 }, (_, index) => `person${String(index).padStart(2, '0')}@example.test`)
  render(<ActivityPersonFilter value="" actors={actors} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Person Everyone' }))
  const suggestions = screen.getByLabelText('Email suggestions')
  expect(suggestions).toHaveClass('max-h-44', 'overflow-y-auto')
  expect(within(suggestions).getAllByRole('button')).toHaveLength(40)
  fireEvent.click(within(suggestions).getByRole('button', { name: 'person39@example.test' }))
  expect(onChange).toHaveBeenCalledWith('person39@example.test')
})

it('does not navigate to months before the visible 15-day range', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-26T12:00:00'))
  try {
    render(<ActivityDateFilter from="" to="" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'When Any time' }))
    fireEvent.click(screen.getByRole('option', { name: 'Choose dates…' }))
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nov 11, 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nov 12, 2026' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  } finally {
    vi.useRealTimers()
  }
})

it('presents completed events without a redundant status label', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/access/activity/actors')) return new Response('[]', { status: 200 })
    return new Response(JSON.stringify({ items: [
      { id: 'grant', occurred_at: '2026-11-18T15:37:40Z', reference_id: 'ref-1', actor: 'jorge.vera@headquarters.co', key_name: null, client_name: null, target_name: 'fna@headquarters.co', environment: null, action: 'Granted fna@headquarters.co permission to edit entities', category: 'create', status: 'completed' },
      { id: 'revoke', occurred_at: '2026-11-18T15:18:28Z', reference_id: 'ref-2', actor: 'jorge.vera@headquarters.co', actor_name: 'Jorge Vera', key_name: null, client_name: null, target_name: 'Jorge Vera', target_email: 'jorge.vera@headquarters.co', environment: null, action: "Revoked Jorge Vera's permission to delete entities", category: 'delete', status: 'completed' },
      { id: 'role', occurred_at: '2026-11-18T15:26:11Z', reference_id: null, actor: 'jorge.vera@headquarters.co', actor_name: 'Jorge Vera', key_name: null, client_name: null, target_name: 'Fiona Alvarez', target_email: 'fna@headquarters.co', environment: null, action: 'Updated Fiona Alvarez: role set to Operator', category: 'update', status: 'completed' },
    ], next_cursor: null, total_count: 3 }), { status: 200 })
  })

  render(<ActivityPage />)
  const history = await screen.findByLabelText('Activity history')
  const events = within(history).getAllByRole('article')
  expect(events).toHaveLength(3)
  expect(history).toHaveTextContent('November 18, 2026')
  expect(screen.queryByText(/Showing the last 15 days/)).not.toBeInTheDocument()
  fireEvent.focus(screen.getByRole('button', { name: 'About Activity history' }))
  expect(screen.getByRole('tooltip')).toHaveTextContent('Showing the last 15 days.')
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('30 days')
  expect(events[0]).toHaveTextContent('jorge.vera@headquarters.co granted fna@headquarters.co permission to edit entities')
  expect(events[1]).toHaveTextContent('Jorge Vera revoked their own permission to delete entities')
  expect(events[1]).not.toHaveTextContent('Completed')
  expect(events[1].querySelector('.text-rose-800')).toBeNull()
  expect(events[2]).toHaveTextContent("Jorge Vera changed Fiona Alvarez's role to Operator")
  expect(history).not.toHaveTextContent('Not permitted')
})

it('does not offer Read as an Activity operation', async () => {
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/access/activity/actors')) return new Response('[]', { status: 200 })
    requests.push(url)
    return new Response(JSON.stringify({ items: [], next_cursor: null, total_count: 0 }), { status: 200 })
  })
  render(<ActivityPage />)
  await screen.findByText('No activity found')
  fireEvent.click(screen.getByRole('button', { name: /^Operation / }))
  expect(screen.queryByRole('option', { name: 'Read' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: 'Updated' }))
  expect(screen.queryByRole('button', { name: 'Clear operation' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Operation / }))
  fireEvent.click(screen.getByRole('option', { name: 'Any operation' }))
  await waitFor(() => expect(requests.at(-1)).not.toContain('category='))
  expect(requests.at(-1)).toContain('scope=qbo_transactions&page=1')
})

it('can clear a date filter with Any time', async () => {
  const requests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/access/activity/actors')) return new Response('[]', { status: 200 })
    requests.push(url)
    return new Response(JSON.stringify({ items: [], next_cursor: null, total_count: 0 }), { status: 200 })
  })
  render(<ActivityPage />)
  await screen.findByText('No activity found')
  fireEvent.click(screen.getByRole('button', { name: /^When / }))
  fireEvent.click(screen.getByRole('option', { name: 'Last 7 days' }))
  await waitFor(() => expect(requests.at(-1)).toContain('from_at='))
  fireEvent.click(screen.getByRole('button', { name: /^When / }))
  fireEvent.click(screen.getByRole('option', { name: 'Any time' }))
  await waitFor(() => expect(requests.at(-1)).not.toContain('from_at='))
  expect(screen.getByRole('button', { name: 'When Any time' })).toBeInTheDocument()
})

it('shows the QuickBooks record and a concise audit detail', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/access/activity/actors')) return new Response('[]', { status: 200 })
    return new Response(JSON.stringify({ items: [{
      id: 'vendor', occurred_at: '2026-11-24T15:57:00Z', reference_id: 'req-vendor',
      actor: 'fna@example.test', actor_name: 'Fiona Alvarez', key_name: 'test 2',
      client_name: 'ACME edited2', target_name: 'ACME edited2', environment: 'sandbox',
      action: 'Created QuickBooks vendor “Nova Farms Logistics” for ACME edited2',
      record_type: 'vendor', record_name: 'Nova Farms Logistics', record_id: '123',
      category: 'create', status: 'completed',
    }], next_cursor: null, total_count: 1 }), { status: 200 })
  })
  render(<ActivityPage />)
  const event = await screen.findByRole('article')
  expect(event).toHaveTextContent('Fiona Alvarez created QuickBooks vendor “Nova Farms Logistics” for ACME edited2')
  fireEvent.click(within(event).getByText('Details'))
  expect(event).toHaveTextContent('QuickBooks ID123')
  expect(event).toHaveTextContent('API keytest 2')
  expect(event).toHaveTextContent('Support referencereq-vendor')
  expect(within(event).getByRole('button', { name: 'Copy support reference' })).toBeInTheDocument()
})

it('shows concrete permission changes in an access event', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/access/activity/actors')) return Response.json([])
    return Response.json({ items: [{
      id: 'policy', occurred_at: '2026-11-26T15:57:00Z', reference_id: 'req-policy',
      actor: 'founder@example.test', key_name: null, client_name: null,
      target_name: 'Fiona', target_email: 'fna@example.test', environment: null,
      action: 'Updated Fiona: 2 entity permissions granted',
      access_changes: ['Granted Read QuickBooks data on ACME', 'Granted Edit QuickBooks data on ACME'],
      category: 'update', status: 'completed',
    }], next_cursor: null, total_count: 1 })
  })
  render(<ActivityPage />)
  const event = await screen.findByRole('article')
  fireEvent.click(within(event).getByText('Details'))
  expect(event).toHaveTextContent('Granted Read QuickBooks data on ACME')
  expect(event).toHaveTextContent('Granted Edit QuickBooks data on ACME')
})
