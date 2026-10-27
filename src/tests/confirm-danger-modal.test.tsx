import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmDangerModal } from '../components/ConfirmDangerModal'

function Example() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)}>Delete entity</button>
    <ConfirmDangerModal
      open={open}
      title="Delete entity"
      description="Confirm this deletion."
      confirmText="Entity A"
      onCancel={() => setOpen(false)}
      onConfirm={() => setOpen(false)}
    />
  </>
}

describe('delete confirmation', () => {
  it('moves focus into a modal and restores it to the trigger on cancel', () => {
    render(<Example />)
    const trigger = screen.getByRole('button', { name: 'Delete entity' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Delete entity' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-describedby')
    expect(within(dialog).getByRole('heading', { name: 'Delete entity' })).toHaveFocus()
    expect(within(dialog).getByRole('textbox', { name: /Type to confirm/ })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
