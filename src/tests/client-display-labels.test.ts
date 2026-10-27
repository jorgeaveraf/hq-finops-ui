import { describe, expect, it } from 'vitest'
import type { QboClient } from '../modules/qbo/api/qboGatewayClient'
import { formatClientGroup, getClientName } from '../modules/qbo/utils'

const mfny: QboClient = {
  id: '1fec4592-e81b-45b1-97e2-8a1e27e87e89',
  name: 'mfny_1',
  client_group: 'mfny_1',
  status: 'active',
  metadata: null,
  environments: ['prod'],
}

describe('client display labels', () => {
  it('shows the existing MFNY values without changing the entity data', () => {
    expect(formatClientGroup(mfny.client_group)).toBe('MFNY')
    expect(getClientName(mfny)).toBe('MFNY')
    expect(mfny.name).toBe('mfny_1')
    expect(mfny.client_group).toBe('mfny_1')
  })

  it('shows the future lowercase database values as MFNY', () => {
    const renamed = { ...mfny, name: 'mfny', client_group: 'mfny' }
    expect(formatClientGroup(renamed.client_group)).toBe('MFNY')
    expect(getClientName(renamed)).toBe('MFNY')
    expect(renamed.name).toBe('mfny')
    expect(renamed.client_group).toBe('mfny')
  })

  it('does not rename another entity with the same saved name', () => {
    expect(getClientName({ ...mfny, id: '00000000-0000-4000-8000-000000000001' })).toBe('mfny_1')
    expect(getClientName({ ...mfny, id: '00000000-0000-4000-8000-000000000001', name: 'mfny' })).toBe('mfny')
    expect(formatClientGroup('nova_farms')).toBe('Nova Farms')
  })
})
