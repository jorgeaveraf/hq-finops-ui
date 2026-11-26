import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('keeps local sign-in errors with the local form', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"Authentication required"}', { status: 401 }))
    await act(async () => {
      render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>)
    })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'someone' } })
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That username or password is incorrect. Please try again.')
    expect(screen.getByLabelText('Username')).toHaveValue('someone')
  })
})
