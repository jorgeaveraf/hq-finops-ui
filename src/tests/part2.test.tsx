import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Part2ExportPage } from '../modules/part2/Part2ExportPage'
import { AuthProvider } from '../modules/auth/AuthProvider'

describe('Part2ExportPage', () => {
  it('accepts drag and drop when using the samples source', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AuthProvider>
          <Part2ExportPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await user.selectOptions(screen.getByLabelText(/source/i), 'samples')
    await user.type(screen.getByLabelText(/notify email/i), 'ops@example.com')

    const file = new File(['content'], 'export.csv', { type: 'text/csv' })
    const fileList = { 0: file, length: 1, item: () => file } as unknown as FileList

    fireEvent.drop(screen.getByTestId('file-upload-dropzone'), { dataTransfer: { files: fileList } })

    expect(screen.getByRole('button', { name: /submit export/i })).toBeEnabled()
  })
})
