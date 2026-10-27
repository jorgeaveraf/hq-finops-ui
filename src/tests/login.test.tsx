import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { LoginPage } from '../modules/auth/LoginPage'

describe('LoginPage', () => {
  it('renders login inputs and button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"Authentication required"}', { status: 401 }))
    await act(async () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>,
      )
    })

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
