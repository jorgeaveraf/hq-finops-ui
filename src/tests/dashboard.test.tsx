import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { AppLayout } from '../layout/AppLayout'

afterEach(() => vi.restoreAllMocks())

async function renderOverview(overview: object) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify(
    String(input).endsWith('/overview')
      ? overview
      : { user: { name: 'Admin', email: 'admin' }, role: 'admin', csrf: 'test' },
  ), { status: 200 }))

  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
  })
  await screen.findByText('Entities')
}

describe('Dashboard', () => {
  it('shows saved operational data without duplicate client-list links or false live status', async () => {
    await renderOverview({
      activeClients: 4, clientGroups: 2, demo: true, connected: 1, disconnected: 1, notChecked: 1,
      unavailable: 1, noCredential: 0, partial: true,
      disconnectedClients: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Sample client B', environment: 'sandbox' }],
    })

    expect(screen.getAllByRole('link', { name: /overview/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /financial operations overview/i })).toBeInTheDocument()
    expect(await screen.findByText('Some entity details could not be loaded. Their connection state is unavailable, not confirmed disconnected.')).toBeInTheDocument()
    expect(screen.getByText('Sample client B')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Entities')).toBeInTheDocument()
    expect(screen.getByText('Connected QuickBooks connections')).toBeInTheDocument()
    expect(screen.queryByText('Demo data included')).not.toBeInTheDocument()
    expect(screen.getByText('Connected QuickBooks connections').parentElement?.querySelector('p')).toHaveClass('mt-auto')
    expect(screen.getByText('Reconnection needed')).toBeInTheDocument()
    expect(screen.queryByText('Unavailable', { selector: 'div' })).not.toBeInTheDocument()
    const unavailableLink = screen.getByRole('link', { name: 'View 2 unavailable connections' })
    expect(unavailableLink).toHaveAttribute('href', '/qbo/clients?connection=unavailable')
    expect(unavailableLink).toHaveTextContent('View entities')
    expect(unavailableLink.querySelector('.group-hover\\:opacity-100')).not.toBeNull()
    expect(screen.getAllByRole('link', { name: /clients & integrations/i }).some((link) => link.getAttribute('href') === '/qbo/clients')).toBe(true)
    const attentionLink = screen.getByRole('link', { name: 'View Sample client B detail' })
    expect(attentionLink).toHaveTextContent('View detail')
    expect(attentionLink.querySelector('.group-hover\\:opacity-100')).not.toBeNull()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    const overviewInfo = screen.getByRole('button', { name: 'About financial operations overview' })
    fireEvent.focus(overviewInfo)
    expect(screen.getByRole('tooltip')).toHaveTextContent('A high-level view of your financial operations, including clients, integrations, and items from the QBO Gateway')
    fireEvent.blur(overviewInfo)
    const statusInfo = screen.getByRole('button', { name: 'About connection results' })
    fireEvent.focus(statusInfo)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Summary of QuickBooks connections by status.')
    expect(screen.queryByText('Mode')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open clients/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/system health/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monitoring active/i)).not.toBeInTheDocument()
  })

  it('pins on a sidebar click, unpins outside, and keeps account controls available', async () => {
    await renderOverview({ activeClients: 1, clientGroups: 1, demo: false, connected: 1, disconnected: 0, notChecked: 0, unavailable: 0, noCredential: 0, disconnectedClients: [], partial: false })
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    expect(sidebar).toHaveClass('w-20')
    expect(within(sidebar).queryByRole('button', { name: /pin sidebar/i })).not.toBeInTheDocument()
    expect(within(sidebar).getByText('FinOps Console').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(within(sidebar).getByRole('link', { name: 'Clients & Integrations' })).toBeInTheDocument()
    vi.useFakeTimers()
    fireEvent.mouseEnter(sidebar.firstElementChild as Element)
    expect(sidebar).toHaveClass('w-20')
    act(() => vi.advanceTimersByTime(299))
    expect(sidebar).toHaveClass('w-20')
    fireEvent.mouseLeave(sidebar.firstElementChild as Element)
    act(() => vi.advanceTimersByTime(1))
    expect(sidebar).toHaveClass('w-20')
    fireEvent.mouseEnter(sidebar.firstElementChild as Element)
    act(() => vi.advanceTimersByTime(300))
    vi.useRealTimers()
    expect(within(sidebar).getByText('FinOps Console').parentElement).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(within(sidebar).getByRole('link', { name: 'Overview' }))
    expect(sidebar).toHaveClass('w-64')
    fireEvent.mouseLeave(sidebar.firstElementChild as Element)
    expect(within(sidebar).getByText('FinOps Console').parentElement).toHaveAttribute('aria-hidden', 'false')
    fireEvent.pointerDown(screen.getByRole('main'))
    expect(sidebar).toHaveClass('w-20')
    expect(within(sidebar).getByText('FinOps Console').parentElement).toHaveAttribute('aria-hidden', 'true')
    fireEvent.mouseEnter(sidebar.firstElementChild as Element)
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Account options' }))
    expect(sidebar).toHaveClass('w-64')
    expect(within(sidebar).getByRole('button', { name: 'Account options' }).querySelector('.h-8.w-8')).not.toBeNull()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Sign out' }))
    const confirmation = screen.getByRole('dialog', { name: 'Sign out?' })
    expect(within(confirmation).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Sign out?' })).not.toBeInTheDocument()
  })

  it('keeps the session and confirmation visible when server sign out fails', async () => {
    await renderOverview({ activeClients: 1, clientGroups: 1, demo: false, connected: 1, disconnected: 0, notChecked: 0, unavailable: 0, noCredential: 0, disconnectedClients: [], partial: false })
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementation(async (_input, init) => new Response(JSON.stringify({ message: 'Gateway unavailable' }), { status: init?.method === 'DELETE' ? 503 : 200 }))
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Account options' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your session is still active')
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('button', { name: 'Account options' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
  })

  it.each([
    {
      name: 'all connected', connected: 4, disconnected: 0, notChecked: 0, unavailable: 0, noCredential: 0, partial: false,
      disconnectedClients: [], warning: false, attention: false, verification: false,
    },
    {
      name: 'disconnected only', connected: 3, disconnected: 1, notChecked: 0, unavailable: 0, noCredential: 0, partial: false,
      disconnectedClients: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Sample client B', environment: 'sandbox' }],
      warning: false, attention: true, verification: false,
    },
    {
      name: 'not checked only', connected: 3, disconnected: 0, notChecked: 1, unavailable: 0, noCredential: 0, partial: false,
      disconnectedClients: [], warning: false, attention: false, verification: true,
    },
    {
      name: 'detail error only', connected: 3, disconnected: 0, notChecked: 0, unavailable: 1, noCredential: 0, partial: true,
      disconnectedClients: [], warning: true, attention: false, verification: true,
    },
    {
      name: 'no credential only', connected: 3, disconnected: 0, notChecked: 0, unavailable: 0, noCredential: 1, partial: false,
      disconnectedClients: [], warning: false, attention: false, verification: true,
    },
  ])('only shows relevant notices when $name', async ({ warning, attention, verification, ...overview }) => {
    await renderOverview({ activeClients: 4, clientGroups: 2, demo: false, ...overview })

    expect(Boolean(screen.queryByText('Some entity details could not be loaded. Their connection state is unavailable, not confirmed disconnected.'))).toBe(warning)
    expect(Boolean(screen.queryByRole('heading', { name: 'Connections needing attention' }))).toBe(attention)
    expect(Boolean(screen.queryByText(/\d+ unavailable$/))).toBe(verification)
    expect(screen.getByText('Reconnection needed').closest('div')).toHaveClass(attention ? 'text-amber-700' : 'text-slate-600')
    expect(Boolean(screen.queryByText('All saved connection states are connected.'))).toBe(!warning && !attention && !verification)
  })
})
