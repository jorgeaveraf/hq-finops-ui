import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const base = 'http://localhost:5174'
const origin = base
const acmeId = '477751f2-1142-4283-a3c0-387f8aa45fbd'
const disconnectedId = '00000000-0000-4000-8000-000000000001'
const uncheckedId = '00000000-0000-4000-8000-000000000002'
const errorId = '00000000-0000-4000-8000-000000000003'
const scenarioId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const additionalIds = Array.from({ length: 20 }, (_, index) => scenarioId(index + 4))

function setMode(mode) {
  execFileSync(process.execPath, ['local/set-local-mock-mode.mjs', mode], { cwd: new URL('..', import.meta.url), stdio: 'pipe' })
}

setMode('mixed')

const page = await fetch(`${base}/automations/`)
assert.equal(page.status, 200)

const anonymous = await fetch(`${base}/automations/api/clients`)
assert.equal(anonymous.status, 401)

const login = await fetch(`${base}/automations/api/session`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'sandbox-admin', password: 'sandbox-demo-only' }),
})
assert.equal(login.status, 200)
const cookie = login.headers.get('set-cookie').split(';')[0]
const { csrf } = await login.json()

const clients = await fetch(`${base}/automations/api/clients`, { headers: { Cookie: cookie } })
assert.equal(clients.status, 200)
const list = await clients.json()
assert.deepEqual(list.map((client) => client.id), [acmeId, disconnectedId, uncheckedId, errorId, ...additionalIds])
assert.deepEqual(list.slice(0, 12).map((client) => client.name), 'ABCDEFGHIJKL'.split('').map((letter) => `Sample entity ${letter}`))
assert.deepEqual(list.slice(0, 12).map((entity) => entity.client_group), [
  'sample_group', 'sample_group', 'another_group', 'another_group',
  'sample_group', 'sample_group', 'another_group', 'another_group',
  'demo_holdings', 'demo_holdings', 'demo_holdings', 'demo_holdings',
])
assert.ok(list.every((entity) => entity.client_group && entity.created_at))
assert.equal(new Set(list.map((entity) => entity.client_group)).size, 15)

const filtered = await fetch(`${base}/automations/api/clients?client_group=sample_group`, { headers: { Cookie: cookie } })
assert.equal(filtered.status, 200)
assert.deepEqual((await filtered.json()).map((entity) => entity.id), [acmeId, disconnectedId, scenarioId(4), scenarioId(5)])

const createdIds = []
try {
  for (const clientGroup of ['sample_group', 'new_local_group']) {
    const created = await fetch(`${base}/automations/api/clients`, {
      method: 'POST',
      headers: {
        Cookie: cookie, Origin: origin, 'Content-Type': 'application/json',
        'X-CSRF-Token': csrf, 'Idempotency-Key': `local-smoke-${clientGroup}`,
      },
      body: JSON.stringify({ name: `Local test entity ${clientGroup}`, client_group: clientGroup, metadata: { tier: 'sandbox' } }),
    })
    assert.equal(created.status, 201)
    const entity = await created.json()
    createdIds.push(entity.id)
    assert.equal(entity.client_group, clientGroup)
    const detailResponse = await fetch(`${base}/automations/api/clients/${entity.id}`, { headers: { Cookie: cookie } })
    assert.equal(detailResponse.status, 200)
    assert.equal((await detailResponse.json()).client_group, clientGroup)
    const groupedResponse = await fetch(`${base}/automations/api/clients?client_group=${clientGroup}`, { headers: { Cookie: cookie } })
    assert.equal(groupedResponse.status, 200)
    assert.ok((await groupedResponse.json()).some((row) => row.id === entity.id))
  }
} finally {
  for (const entityId of createdIds) {
    const removed = await fetch(`${base}/automations/api/clients/${entityId}`, {
      method: 'DELETE', headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf },
    })
    assert.equal(removed.status, 200)
  }
}

const overview = await fetch(`${base}/automations/api/overview`, { headers: { Cookie: cookie } })
assert.equal(overview.status, 200)
const snapshot = await overview.json()
assert.equal(snapshot.activeClients, 24)
assert.equal(snapshot.connected, 8)
assert.equal(snapshot.disconnected, 7)
assert.equal(snapshot.notChecked, 6)
assert.equal(snapshot.unavailable, 1)
assert.equal(snapshot.noCredential, 2)
assert.equal(snapshot.partial, true)
assert.deepEqual(snapshot.disconnectedClients.map((client) => client.id), [disconnectedId, scenarioId(5), scenarioId(9), scenarioId(13), scenarioId(16), scenarioId(19), scenarioId(22)])

const detail = await fetch(`${base}/automations/api/clients/${acmeId}`, { headers: { Cookie: cookie } })
assert.equal(detail.status, 200)
const body = await detail.json()
assert.deepEqual(body.connections.map((connection) => ({
  environment: connection.environment,
  is_connected: connection.is_connected,
  connection_checked_at: connection.connection_checked_at,
})), [{
  environment: 'sandbox',
  is_connected: true,
  connection_checked_at: '2026-10-21T22:49:48.091203Z',
}])
assert.equal('credentials' in body, false)
assert.equal(body.client_group, 'sample_group')

async function connectionFor(clientId) {
  const response = await fetch(`${base}/automations/api/clients/${clientId}`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  const payload = await response.json()
  return payload.connections[0]
}

const disconnected = await connectionFor(disconnectedId)
assert.equal(disconnected.is_connected, false)
assert.equal(disconnected.connection_checked_at, '2026-10-21T22:49:48.091203Z')

const unchecked = await connectionFor(uncheckedId)
assert.equal(unchecked.is_connected, null)
assert.equal(unchecked.connection_checked_at, null)

for (const noCredentialId of [scenarioId(8), scenarioId(11)]) {
  const response = await fetch(`${base}/automations/api/clients/${noCredentialId}`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).connections, [])
}

const unavailable = await fetch(`${base}/automations/api/clients/${errorId}`, { headers: { Cookie: cookie } })
assert.equal(unavailable.status, 502)
assert.deepEqual(await unavailable.json(), { message: 'Gateway unavailable' })

const prod = await fetch(`${base}/automations/api/clients/${acmeId}/reconnect?environment=prod`, { headers: { Cookie: cookie } })
assert.equal(prod.status, 400)
const noMockAuthorization = await fetch(`${base}/automations/api/clients/${acmeId}/reconnect?environment=sandbox`, { headers: { Cookie: cookie } })
assert.notEqual(noMockAuthorization.status, 200)

setMode('all-connected')
const clearOverview = await fetch(`${base}/automations/api/overview`, { headers: { Cookie: cookie } })
assert.equal(clearOverview.status, 200)
assert.deepEqual(await clearOverview.json(), {
  activeClients: 24, clientGroups: 15, demo: false, connected: 24, disconnected: 0, notChecked: 0,
  unavailable: 0, noCredential: 0, disconnectedClients: [], partial: false,
})
const restoredDetail = await fetch(`${base}/automations/api/clients/${errorId}`, { headers: { Cookie: cookie } })
assert.equal(restoredDetail.status, 200)

process.stdout.write('Docker sandbox smoke: 24 synthetic entities in 15 groups, no mock authorization, mixed states and all-connected state verified.\n')
