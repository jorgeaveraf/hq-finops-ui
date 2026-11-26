// Visual review using actual event wording supplied in the Activity screenshots.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const output = await mkdtemp(join(tmpdir(), 'finops-activity-story-'))
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const events = [
  { id: '1', action: 'Rotated API key idk', category: 'update', status: 'completed', actor: 'jorge.vera@headquarters.co', actor_name: 'Jorge Vera', target_name: 'idk', key_name: null, client_name: null },
  { id: '2', action: 'Created API key test 2', category: 'create', status: 'completed', actor: 'fna@headquarters.co', target_name: 'test 2', key_name: null, client_name: null },
  { id: '3', action: "Revoked Jorge Vera's permission to delete entities", category: 'delete', status: 'completed', actor: 'jorge.vera@headquarters.co', actor_name: 'Jorge Vera', target_name: 'Jorge Vera', target_email: 'jorge.vera@headquarters.co', key_name: null, client_name: null },
  { id: '4', action: 'Updated Fiona Alvarez: role set to Operator', category: 'update', status: 'completed', actor: 'jorge.vera@headquarters.co', actor_name: 'Jorge Vera', target_name: 'Fiona Alvarez', target_email: 'fna@headquarters.co', key_name: null, client_name: null },
  { id: '5', action: 'Tried to view QuickBooks data for ACME Sandbox', category: 'read', status: 'denied', actor: 'fna@headquarters.co', target_name: 'ACME Sandbox', key_name: 'Reports', client_name: 'ACME Sandbox' },
]
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.route('**/automations/api/**', (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace('/automations/api', '')
      let data
      if (path === '/access/session') data = { user: { name: 'Jorge Vera', email: 'jorge.vera@headquarters.co', issuer: 'https://accounts.google.com', sub: 's1' }, csrf: 'fixture' }
      else if (path === '/access/me') data = { user: { id: 'u1', role: 'Admin', status: 'active' }, effective_grants: [{ id: 'g1', operation: 'activity.read', client_id: null, environment: null }] }
      else if (path === '/access/activity/actors') data = ['jorge.vera@headquarters.co', 'fna@headquarters.co']
      else if (path === '/access/activity/summary') data = { items: events.map((item, index) => ({ ...item, occurred_at: `2026-11-18T15:${String(30 - index).padStart(2, '0')}:00Z`, reference_id: `ref-${item.id}`, environment: item.id === '5' ? 'sandbox' : null })), next_cursor: null, total_count: events.length }
      else return route.fulfill({ status: 404, json: { message: 'Not found' } })
      return route.fulfill({ json: data })
    })
    await page.goto('http://localhost:5173/automations/access/activity')
    const rows = page.locator('[aria-label="Activity history"] article')
    await rows.first().waitFor()
    assert.equal(await rows.count(), 5)
    assert.match(await rows.nth(2).innerText(), /Jorge Vera revoked their own permission to delete entities[\s\S]*Completed/)
    assert.match(await rows.nth(3).innerText(), /Jorge Vera changed Fiona Alvarez's role to Operator/)
    assert.match(await rows.nth(4).innerText(), /Not permitted/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: join(output, `activity-${width}.png`), fullPage: true })
    await page.close()
  }
  process.stdout.write(`${output}\n`)
} finally {
  await browser.close()
}
