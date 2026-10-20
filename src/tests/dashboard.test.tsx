/// <reference types="vitest" />
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { AppLayout } from '../layout/AppLayout'

describe('Dashboard', () => {
  it('keeps the core navigation and content without the retired health status', () => {
    localStorage.setItem('hq_finops_auth', 'admin')

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

    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /financial operations control center/i })).toBeInTheDocument()
    expect(screen.getByText(/quickbooks connection management/i)).toBeInTheDocument()
    expect(screen.queryByText(/^status$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/system health/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monitoring active/i)).not.toBeInTheDocument()
  })
})
