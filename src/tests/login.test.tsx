import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { LoginPage } from '../modules/auth/LoginPage'

describe('LoginPage', () => {
  it('offers only Google sign-in and never requests a local session', async () => {
    const requests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requests.push(String(input))
      return new Response('{"message":"Authentication required"}', { status: 401 })
    })
    await act(async () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>,
      )
    })

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(requests).toEqual(['/automations/api/access/session'])
  })
})
