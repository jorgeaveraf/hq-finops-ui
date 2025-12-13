/// <reference types="vitest" />
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('enables submit after dropping CSV files', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AuthProvider>
          <Part1IngestionPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/notify email/i), 'ops@example.com')

    const file = new File(['content'], 'statement.csv', { type: 'text/csv' })
    const fileList = { 0: file, length: 1, item: () => file } as unknown as FileList
    fireEvent.drop(screen.getByTestId('file-upload-dropzone'), { dataTransfer: { files: fileList } })

    expect(screen.getByRole('button', { name: /submit ingestion/i })).toBeEnabled()
  })
})
