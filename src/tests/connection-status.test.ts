import { describe, expect, it } from 'vitest'
import { getClientEnvironments, getClientRecordStatus, getConnectionStatus, formatCheckedAt } from '../modules/qbo/utils'

describe('stored connection status', () => {
  it('shows checked true as connected', () => {
    expect(getConnectionStatus({ environment: 'sandbox', is_connected: true, connection_checked_at: '2026-10-21T22:49:48Z', realm_id: null }).label).toBe('Connected')
  })
  it('shows checked false as needing reconnection without claiming expiration', () => {
    expect(getConnectionStatus({ environment: 'sandbox', is_connected: false, connection_checked_at: '2026-10-21T22:49:48Z', realm_id: null })).toEqual({
      label: 'Reconnect needed', tone: 'warning', reason: 'Disconnected',
    })
  })
  it('does not infer disconnected without a check', () => {
    expect(getConnectionStatus({ environment: 'sandbox', is_connected: false, connection_checked_at: null, realm_id: null })).toEqual({
      label: 'Unavailable', tone: 'neutral', reason: 'Not checked',
    })
    expect(formatCheckedAt(null)).toBe('No review recorded')
  })
  it('uses the saved tier for the initial connection without inventing a credential', () => {
    expect(getClientEnvironments({
      id: '00000000-0000-4000-8000-000000000004',
      name: 'No credential',
      client_group: null,
      status: 'active',
      metadata: { tier: 'sandbox' },
      environments: [],
      connections: [],
    })).toEqual(['sandbox'])
  })
  it('uses the canonical client status instead of stale metadata', () => {
    expect(getClientRecordStatus({
      id: '00000000-0000-4000-8000-000000000005', name: 'Sample client F',
      client_group: null,
      status: 'active', metadata: { status: 'inactive' }, environments: [],
    })).toBe('active')
  })
})
