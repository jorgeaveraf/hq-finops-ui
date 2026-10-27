import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FilterDropdown } from '../components/FilterDropdown'

function Fixture() {
  const [value, setValue] = useState('all')
  return (
    <FilterDropdown
      label="Client"
      placeholder="All clients"
      value={value}
      onChange={setValue}
      options={[
        { value: 'another', label: 'Another Group' },
        { value: 'demo', label: 'Demo Holdings' },
        { value: 'sample', label: 'Sample Group' },
      ]}
    />
  )
}

describe('filter dropdown', () => {
  it('keeps the default label out of the options without an individual clear action', () => {
    render(<Fixture />)
    fireEvent.click(screen.getByRole('button', { name: 'Client All clients' }))
    const listbox = screen.getByRole('listbox', { name: 'Client' })
    expect(within(listbox).queryByRole('option', { name: 'All clients' })).not.toBeInTheDocument()
    expect(within(listbox).getAllByRole('option')).toHaveLength(3)
    fireEvent.click(within(listbox).getByRole('option', { name: 'Demo Holdings' }))
    expect(screen.getByRole('button', { name: 'Client Demo Holdings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear Client filter' })).not.toBeInTheDocument()
  })

  it('supports arrow keys, typeahead, Home, End, and Escape', () => {
    render(<Fixture />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Client All clients' }), { key: 'ArrowDown' })
    const listbox = screen.getByRole('listbox', { name: 'Client' })
    expect(within(listbox).getByRole('option', { name: 'Another Group' })).toHaveFocus()
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(within(listbox).getByRole('option', { name: 'Demo Holdings' })).toHaveFocus()
    fireEvent.keyDown(listbox, { key: 'End' })
    expect(within(listbox).getByRole('option', { name: 'Sample Group' })).toHaveFocus()
    fireEvent.keyDown(listbox, { key: 'd' })
    expect(within(listbox).getByRole('option', { name: 'Demo Holdings' })).toHaveFocus()
    fireEvent.keyDown(listbox, { key: 'Home' })
    expect(within(listbox).getByRole('option', { name: 'Another Group' })).toHaveFocus()
    fireEvent.keyDown(listbox, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client All clients' })).toHaveFocus()
  })
})
