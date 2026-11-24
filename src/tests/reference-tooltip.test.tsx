import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReferenceTooltip } from '../modules/activity/ReferenceTooltip'

function References() {
  const [openId, setOpenId] = useState<string | null>(null)
  return <div>
    {['ref-one', 'ref-two'].map((reference) => <ReferenceTooltip
      key={reference}
      reference={reference}
      open={openId === reference}
      anotherOpen={openId !== null}
      onToggle={() => setOpenId((current) => current === reference ? null : reference)}
      onClose={() => setOpenId((current) => current === reference ? null : current)}
    />)}
    <button type="button">Outside</button>
  </div>
}

it('keeps a single click-open reference, switches it, and closes on Escape or outside click', () => {
  render(<References />)
  const triggers = screen.getAllByRole('button', { name: 'Support reference' })
  expect(screen.queryByRole('dialog', { name: 'Support reference' })).not.toBeInTheDocument()
  fireEvent.click(triggers[0])
  expect(screen.getByRole('dialog', { name: 'Support reference' })).toHaveTextContent('ref-one')
  fireEvent.mouseEnter(triggers[1])
  expect(screen.getAllByRole('dialog', { name: 'Support reference' })).toHaveLength(1)
  fireEvent.click(triggers[1])
  expect(screen.getByRole('dialog', { name: 'Support reference' })).toHaveTextContent('ref-two')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Support reference' })).not.toBeInTheDocument()
  fireEvent.click(triggers[0])
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.queryByRole('dialog', { name: 'Support reference' })).not.toBeInTheDocument()
})

it('copies the complete reference from its popover', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<References />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Support reference' })[0])
  const popover = screen.getByRole('dialog', { name: 'Support reference' })
  fireEvent.click(within(popover).getByRole('button', { name: 'Copy reference ID' }))
  expect(writeText).toHaveBeenCalledWith('ref-one')
  expect(await within(popover).findByRole('status')).toHaveTextContent('Copied')
})
