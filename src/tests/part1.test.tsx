/// <reference types="vitest" />
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Part1IngestionPage } from '../modules/part1/Part1IngestionPage'
import { AuthProvider } from '../modules/auth/AuthProvider'

describe('Part1IngestionPage', () => {
  it('shows required fields and disables submit when empty', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Part1IngestionPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/week year/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/week number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/notify email/i)).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: /submit ingestion/i })
    expect(submitButton).toBeDisabled()
  })
})
