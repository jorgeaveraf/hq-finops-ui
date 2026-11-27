import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActivityPage } from '../modules/activity/ActivityPage'
import { MemoryRouter } from 'react-router-dom'

afterEach(() => vi.restoreAllMocks())

it('shows the total and lets a person jump to a page without stepping through each one', async () => {
  const requestedPages: number[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/access/activity/actors')) return new Response('[]', { status: 200 })
    const page = Number(url.searchParams.get('page'))
    requestedPages.push(page)
    return new Response(JSON.stringify({
      items: [{ id: `event-${page}`, occurred_at: '2026-11-18T12:00:00Z', reference_id: null,
        actor: 'ana@example.test', key_name: null, client_name: null, target_name: null,
        environment: null, action: `Updated page ${page}`, category: 'update', status: 'completed' }],
      next_cursor: page < 5 ? 'next' : null, total_count: 113,
    }), { status: 200 })
  })

  render(<MemoryRouter><ActivityPage /></MemoryRouter>)
  expect(await screen.findByText('updated page 1')).toBeInTheDocument()
  const pagination = screen.getByRole('navigation', { name: 'Activity pages' })
  expect(pagination).toHaveTextContent('of 5')
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByText('updated page 2')).toBeInTheDocument()
  const input = screen.getByRole('textbox', { name: 'Go to page' })
  fireEvent.change(input, { target: { value: '5' } })
  fireEvent.blur(input)
  expect(await screen.findByText('updated page 5')).toBeInTheDocument()
  expect(requestedPages).toEqual([1, 2, 5])
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '9' } })
  fireEvent.blur(input)
  await waitFor(() => expect(input).toHaveValue('5'))
  expect(requestedPages).toEqual([1, 2, 5])
})
