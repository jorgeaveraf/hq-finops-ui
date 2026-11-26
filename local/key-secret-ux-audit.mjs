// Synthetic API fixture only. Never creates an application key.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const output = await mkdtemp(join(tmpdir(), 'finops-key-secret-'))
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
const errors = []
const keys = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/automations/api/**', (route) => {
  const url = new URL(route.request().url())
  const path = url.pathname.replace('/automations/api', '')
  const method = route.request().method()
  if (path === '/access/session') return route.fulfill({ json: { user: { name: 'Ana', email: 'ana@example.test', issuer: 'google', sub: 'ana' }, csrf: 'fixture' } })
  if (path === '/access/me') return route.fulfill({ json: { user: { id: 'u1', role: 'Operator', status: 'active' }, effective_grants: [{ id: 'g1', operation: 'client.read', client_id: null, environment: null }] } })
  if (path === '/access/keys/policy') return route.fulfill({ json: { active_count: keys.length, active_limit: 10, maximum_expiration_days: 120 } })
  if (path === '/access/keys' && method === 'GET') return route.fulfill({ json: keys })
  if (path === '/access/keys' && method === 'POST') {
    const key = { id: `k${keys.length + 1}`, owner_user_id: 'u1', name: JSON.parse(route.request().postData()).name, secret_suffix: 'xyz123', status: 'active', created_at: '2026-11-18T00:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, replaces_key_id: null }
    keys.push(key)
    return route.fulfill({ status: 201, json: { ...key, secret: 'qgk_fixture_secret_123' } })
  }
  if (path === '/access/grants' && url.searchParams.has('api_key_id')) return route.fulfill({ json: [{ id: 'kg1', api_key_id: 'k1', operation: 'client.read', client_id: null, environment: null }] })
  if (path === '/clients') return route.fulfill({ json: [] })
  return route.fulfill({ status: 404, json: { message: 'Fixture route missing' } })
})

try {
  for (const width of [1280, 390]) {
    keys.length = 0
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://localhost:5173/automations/access/keys')
    await page.getByRole('button', { name: 'Create API key' }).click()
    await page.getByRole('textbox', { name: 'Key name' }).fill('Bills Automation')
    await page.getByRole('button', { name: 'Create key' }).click()
    await page.getByRole('dialog', { name: 'New API key secret' }).waitFor()
    assert.equal(await page.getByText('Fixture route missing').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: join(output, `secret-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Copy key' }).click()
    await page.getByRole('button', { name: 'Copied' }).waitFor()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'qgk_fixture_secret_123')
    await page.getByRole('button', { name: 'Done' }).click()
    assert.equal(await page.getByTestId('new-key-secret').count(), 0)
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', output, checks: 'desktop/mobile, one-time warning, copy/feedback, dismiss, no overflow or browser errors' }))
} finally { await browser.close() }
