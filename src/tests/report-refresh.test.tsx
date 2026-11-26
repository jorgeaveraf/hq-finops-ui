import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ReportRefreshControl } from '../modules/dashboard/ReportRefreshControl'
import { ReportRefreshProvider } from '../modules/dashboard/ReportRefreshProvider'
import { setCsrfToken } from '../api/finopsApi'

afterEach(() => { vi.restoreAllMocks(); setCsrfToken(null) })

describe('Report refresh', () => {
  it('offers only aging and requires confirmation before requesting it', async () => {
    setCsrfToken('csrf-test')
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => new Response(JSON.stringify(String(url).endsWith('/current')
      ? { runId: null, status: 'idle' }
      : { runId: '00000000-0000-4000-8000-000000000001', status: 'queued' }), { status: options?.method === 'POST' ? 202 : 200 }))
    render(<ReportRefreshProvider enabled><ReportRefreshControl /></ReportRefreshProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    expect(screen.getAllByRole('button', { name: /Coming soon/ })).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'AP / AR aging' }))
    const dialog = screen.getByRole('dialog', { name: 'Refresh AP / AR aging?' })
    expect(request).not.toHaveBeenCalledWith('/automations/api/reports/aging/refresh', expect.objectContaining({ method: 'POST' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request refresh' }))
    expect(await screen.findByText('Request accepted. The report will start shortly.')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/automations/api/reports/aging/refresh', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-test' }) }))
  })

  it('shows configuration failures outside the confirmation dialog', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(JSON.stringify(String(url).endsWith('/current')
      ? { runId: null, status: 'idle' }
      : { message: 'Aging refresh is not configured' }), { status: String(url).endsWith('/current') ? 200 : 503 }))
    render(<ReportRefreshProvider enabled><ReportRefreshControl /></ReportRefreshProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    fireEvent.click(screen.getByRole('button', { name: 'AP / AR aging' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request refresh' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aging refresh is not configured')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the active run when the overview unmounts and mounts again', async () => {
    setCsrfToken('csrf-test')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => new Response(JSON.stringify(String(url).endsWith('/current')
      ? { runId: null, status: 'idle' }
      : { runId: '00000000-0000-4000-8000-000000000002', status: 'queued' }), { status: options?.method === 'POST' ? 202 : 200 }))
    const view = (visible: boolean) => <ReportRefreshProvider enabled>{visible ? <ReportRefreshControl /> : <div>Another view</div>}</ReportRefreshProvider>
    const { rerender } = render(view(true))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    fireEvent.click(screen.getByRole('button', { name: 'AP / AR aging' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request refresh' }))
    expect(await screen.findByText('Request accepted. The report will start shortly.')).toBeInTheDocument()
    rerender(view(false))
    expect(screen.getByText('Another view')).toBeInTheDocument()
    rerender(view(true))
    expect(screen.getByRole('button', { name: 'Refresh report' })).toBeDisabled()
    expect(screen.getByText('Request accepted. The report will start shortly.')).toBeInTheDocument()
  })

  it('notifies completion while another view is shown', async () => {
    setCsrfToken('csrf-test')
    const notice = vi.spyOn(toast, 'success').mockImplementation(() => 'notice')
    const interval = vi.spyOn(window, 'setInterval')
    let started = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') { started = true; return new Response(JSON.stringify({ runId: '00000000-0000-4000-8000-000000000003', status: 'queued' }), { status: 202 }) }
      return new Response(JSON.stringify(started
        ? { runId: '00000000-0000-4000-8000-000000000003', status: 'passed' }
        : { runId: null, status: 'idle' }), { status: 200 })
    })
    const view = (visible: boolean) => <ReportRefreshProvider enabled>{visible ? <ReportRefreshControl /> : <div>Another view</div>}</ReportRefreshProvider>
    const { rerender } = render(view(true))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    fireEvent.click(screen.getByRole('button', { name: 'AP / AR aging' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request refresh' }))
    expect(await screen.findByText('Request accepted. The report will start shortly.')).toBeInTheDocument()
    rerender(view(false))
    await act(async () => { (interval.mock.calls[0][0] as () => void)(); await Promise.resolve() })
    expect(screen.getByText('Another view')).toBeInTheDocument()
    expect(notice).toHaveBeenCalledWith('AP / AR aging refreshed successfully.')
  })
})
