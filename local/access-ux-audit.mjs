// Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core/index.mjs.
// Uses synthetic API responses; never changes application data.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const output = await mkdtemp(join(tmpdir(), 'finops-access-ux-'))
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const grants = ['client.read', 'client.update', 'users.admin', 'grants.admin', 'activity.read'].map((operation, i) => ({ id: `g${i}`, operation, client_id: null, environment: null }))
const people = [
  { id: 'u1', display_name: 'Jorge Vera', email: 'jorge.vera@example.test', role: 'Admin', status: 'active', sub: 's1' },
  { id: 'u2', display_name: null, email: 'finance.operations.team@example.test', role: 'Admin', status: 'active', sub: 's2' },
  { id: 'u3', display_name: 'Alex Morgan', email: 'alex@example.test', role: 'Viewer', status: 'disabled', sub: null },
]
const keys = [
  { id: 'k1', name: 'Monthly financial reports', secret_suffix: 'a1B2c3', status: 'active', created_at: '2026-11-01', expires_at: null, last_used_at: '2026-11-18', revoked_at: null },
  { id: 'k2', name: 'Accounts payable automation', secret_suffix: 'd4E5f6', status: 'active', created_at: '2026-11-02', expires_at: new Date(Date.now() + 86400000 * 10).toISOString(), last_used_at: null, revoked_at: null },
  { id: 'k3', name: 'Previous reporting key', secret_suffix: 'g7H8i9', status: 'revoked', created_at: '2026-10-02', expires_at: null, last_used_at: null, revoked_at: '2026-11-17' },
]
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.hostname !== 'localhost') return route.abort()
  if (!url.pathname.startsWith('/automations/api/')) return route.continue()
  const path = url.pathname.replace('/automations/api', '')
  if (path.endsWith('/policy/preview') && route.request().method() === 'POST') return route.fulfill({ json: { fingerprint: 'fixture-preview', affected_keys: ['Monthly financial reports'], suspended_keys: ['Monthly financial reports'], changes: ['Remove 1 permission'] } })
  assert.equal(route.request().method(), 'GET', 'Visual audit must not write application data')
  let data
  if (path === '/access/session') data = { user: { name: 'Jorge Vera', email: people[0].email, issuer: 'https://accounts.google.com', sub: 's1' }, csrf: 'fixture' }
  else if (path === '/access/me') data = { user: people[0], effective_grants: grants }
  else if (path === '/access/users') data = people
  else if (path === '/access/keys') data = keys
  else if (path === '/access/keys/policy') data = { active_count: 2, active_limit: 10, maximum_expiration_days: 120 }
  else if (path === '/access/grants') data = grants.slice(0, 2)
  else if (path === '/clients') data = [{ id: 'c1', name: 'ACME Sandbox' }]
  else if (path === '/access/activity/actors') data = people.map((person) => person.email)
  else if (path === '/access/activity/summary') {
    const pageNumber = Number(url.searchParams.get('page') || 1)
    const important = url.searchParams.get('scope') === 'important'
    const examples = important
      ? [
          { action: 'Updated ACME Sandbox', category: 'update', status: 'completed' },
          { action: 'Changed the role of finance.operations.team@example.test to Operator', category: 'update', status: 'completed' },
          { action: 'Tried to view QuickBooks data for ACME Sandbox', category: 'read', status: 'denied' },
          { action: 'Deleted an old connection', category: 'delete', status: 'completed' },
        ]
      : [
          { action: 'Viewed the entity list', category: 'read', status: 'completed' },
          { action: 'Viewed ACME Sandbox', category: 'read', status: 'completed' },
          { action: 'Updated ACME Sandbox', category: 'update', status: 'completed' },
          { action: 'Tried to view QuickBooks data for ACME Sandbox', category: 'read', status: 'denied' },
        ]
    data = { next_cursor: pageNumber < 5 ? 'next' : null, total_count: 113, items: Array.from({ length: pageNumber === 5 ? 13 : 25 }, (_, i) => ({
      id: `e${pageNumber}-${i}`, occurred_at: '2026-11-18T15:25:00Z', reference_id: `adf3e904-40aa-4b35-b0b9-2d4b08d2e0${i}`,
      actor: people[i % 2].email, key_name: i === 1 ? 'Monthly financial reports' : null, environment: i === 1 ? 'sandbox' : null,
      ...examples[i % examples.length],
    })) }
  }
  else return route.fulfill({ status: 404, json: { message: 'Fixture route not found' } })
  return route.fulfill({ json: data })
})
const screenshot = async (name) => page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
async function checkLayout(label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false, `${label}: page overflows horizontally`)
  const nav = page.getByRole('navigation', { name: page.viewportSize().width >= 768 ? 'Main navigation' : 'Mobile navigation' })
  assert.ok(await nav.locator('[aria-current="page"]').count() <= 1, `${label}: duplicate active navigation`)
  if (page.viewportSize().width < 768 && await nav.locator('[aria-current="page"]').count()) {
    const active = await nav.locator('[aria-current="page"]').boundingBox()
    assert.ok(active.x >= 0 && active.x + active.width <= page.viewportSize().width, `${label}: active destination is off screen`)
  }
}
try {
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [route, heading] of [['activity', 'Activity'], ['users', 'People and access'], ['keys', 'My API keys']]) {
      await page.goto(`http://localhost:5173/automations/access/${route}`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      await page.getByText(/Loading activity|Loading keys|Loading people/).waitFor({ state: 'hidden' })
      await checkLayout(`${route}-${width}-collapsed`)
      if (width >= 768) {
        await page.mouse.move(width - 30, 800)
        await page.waitForTimeout(400)
        await page.getByRole('complementary', { name: 'Sidebar' }).hover({ position: { x: 35, y: 40 } })
        await page.waitForTimeout(700)
        assert.ok((await page.getByRole('complementary', { name: 'Sidebar' }).boundingBox()).width > 250)
        await checkLayout(`${route}-${width}-expanded`)
      }
      await screenshot(`${route}-${width}`)
      if (route === 'activity') {
        assert.equal(await page.getByRole('button', { name: 'Changes & issues' }).getAttribute('aria-pressed'), 'true')
        await page.getByRole('button', { name: 'All activity' }).click()
        await page.getByText('viewed the entity list').first().waitFor()
        await screenshot(`activity-all-${width}`)
        await page.getByRole('button', { name: 'Changes & issues' }).click()
        await page.getByText('viewed the entity list').first().waitFor({ state: 'hidden' })
        const jump = page.getByRole('textbox', { name: 'Go to page' })
        assert.equal(await page.getByRole('navigation', { name: 'Activity pages' }).getByText('of 5').count(), 1)
        if (width === 1280) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          const footerPosition = await page.getByRole('navigation', { name: 'Activity pages' }).evaluate((element) => element.getBoundingClientRect())
          assert.ok(footerPosition.top >= 0 && footerPosition.bottom <= 900, 'pagination sits below the results')
          await page.getByRole('button', { name: 'Next page' }).click()
          await page.waitForFunction(() => document.querySelector('[aria-busy="false"]') && document.querySelector('input[aria-label="Go to page"]')?.value === '2')
          const newPagePosition = await page.evaluate(() => window.scrollY)
          assert.ok(newPagePosition > 100, 'changing pages does not return to the top of the entire screen')
          const nextFooterPosition = await page.getByRole('navigation', { name: 'Activity pages' }).evaluate((element) => element.getBoundingClientRect())
          assert.ok(nextFooterPosition.top >= 0 && nextFooterPosition.bottom <= 900, 'pagination stays in view after changing pages')
        }
        await jump.fill('5')
        await jump.press('Enter')
        await page.waitForFunction(() => document.querySelector('[aria-busy="false"]') && document.querySelector('input[aria-label="Go to page"]')?.value === '5')
        assert.equal(await page.getByRole('navigation', { name: 'Activity pages' }).isVisible(), true)
        if (width === 1280) {
          const lastFooterPosition = await page.getByRole('navigation', { name: 'Activity pages' }).evaluate((element) => element.getBoundingClientRect())
          assert.ok(lastFooterPosition.top >= 0 && lastFooterPosition.bottom <= 900, 'pagination stays in view when the final page has fewer rows')
        }
        await screenshot(`activity-last-page-${width}`)
        await jump.fill('1')
        await jump.press('Enter')
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Activity pages"] button[aria-label="Previous page"]')?.disabled === true)
      }
      if (route === 'users') {
        await page.getByRole('button', { name: 'Add person' }).click()
        const dialog = page.getByRole('dialog', { name: 'Add person' })
        await dialog.waitFor({ state: 'visible' })
        assert.equal(await dialog.getByPlaceholder('name@company.com').evaluate((element) => element === document.activeElement), true)
        await dialog.getByRole('button', { name: /^Initial role / }).click()
        await screenshot(`add-person-${width}`)
        await page.keyboard.press('Escape')
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        assert.equal(await page.getByRole('button', { name: 'Add person' }).evaluate((element) => element === document.activeElement), true)
      }
      if (route === 'activity') {
        await page.getByRole('button', { name: 'Views', exact: true }).click()
        await screenshot(`activity-views-${width}`)
        await page.getByText('Loading activity…').waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: /^When / }).click()
        await page.getByRole('option', { name: 'Choose dates…' }).click()
        const dates = page.getByRole('dialog', { name: 'Choose a date range' })
        await dates.waitFor({ state: 'visible' })
        await screenshot(`activity-calendar-${width}`)
        const days = dates.getByRole('button', { pressed: false }).filter({ hasText: /^\d+$/ })
        await days.first().click()
        await dates.getByRole('button', { pressed: true }).click()
        await dates.getByRole('button', { name: 'Use these dates' }).click()
        await dates.waitFor({ state: 'hidden' })
        assert.equal(await page.getByRole('button', { name: /^When / }).evaluate((element) => element === document.activeElement), true)
        await page.getByRole('button', { name: 'Clear filters' }).click()
        await page.getByText('Loading activity…').waitFor({ state: 'hidden' })
      }
      if (route === 'activity' && width === 1280) {
        const trigger = page.getByLabel('Support reference', { exact: true }).first()
        await trigger.hover()
        const tooltip = page.getByRole('tooltip').first()
        await tooltip.waitFor({ state: 'visible' })
        await tooltip.hover()
        assert.equal(await tooltip.isVisible(), true)
        await tooltip.locator('.font-mono').evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range) })
        assert.match(await page.evaluate(() => window.getSelection().toString()), /^adf3e904/)
        await screenshot('activity-tooltip')
        await trigger.focus()
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('tooltip').count(), 0)
      }
      if (route === 'keys' && width !== 1024) {
        await page.getByRole('button', { name: 'Create API key', exact: true }).click()
        await page.getByRole('dialog', { name: 'Create API key', exact: true }).waitFor()
        await checkLayout(`key-modal-${width}`)
        await screenshot(`key-modal-${width}`)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        assert.equal(await page.getByRole('button', { name: 'Create API key', exact: true }).evaluate((element) => element === document.activeElement), true)
        await page.getByRole('button', { name: /^Actions for / }).first().click()
        await page.getByRole('button', { name: 'Replace key', exact: true }).waitFor()
        await screenshot(`key-actions-${width}`)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Replace key', exact: true }).waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: /^Actions for / }).first().click()
        await page.mouse.click(5, 5)
        await page.getByRole('button', { name: 'Replace key', exact: true }).waitFor({ state: 'hidden' })
        for (const action of ['Replace key', 'Revoke access']) {
          await page.getByRole('button', { name: /^Actions for / }).first().click()
          await page.getByRole('button', { name: action, exact: true }).first().click()
          await page.getByRole('dialog', { name: action }).waitFor()
          await screenshot(`key-${action.replaceAll(' ', '-')}-${width}`)
          await page.getByRole('button', { name: 'Cancel', exact: true }).click()
        }
        await page.getByRole('button', { name: /View key history/ }).click()
        await screenshot(`key-history-${width}`)
        await page.mouse.click(5, 5)
        await page.getByRole('dialog', { name: 'Key history' }).waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: /within 30 days/ }).click()
        await screenshot(`key-expiry-${width}`)
        await page.getByRole('button', { name: 'Close', exact: true }).click()
      }
    }
    await page.goto('http://localhost:5173/automations/access/users/u2')
    await page.getByRole('heading', { name: people[1].email, exact: true }).waitFor()
    await checkLayout(`person-${width}`)
    await screenshot(`person-${width}`)
    await page.getByRole('button', { name: 'Edit access', exact: true }).click()
    await page.getByRole('dialog', { name: 'Change access' }).waitFor()
    await page.getByRole('button', { name: 'Role & sign-in' }).click()
    assert.equal(await page.getByRole('group', { name: 'Role', exact: true }).getByRole('button').count(), 3)
    await screenshot(`person-role-${width}`)
    await page.getByRole('button', { name: 'Actions & entities' }).click()
    await page.getByRole('button', { name: 'Add an action', exact: true }).click()
    await screenshot(`person-add-permission-${width}`)
    await page.getByRole('button', { name: /^What can they do\?/ }).click()
    await page.getByRole('option', { name: 'View QuickBooks data' }).waitFor({ state: 'visible' })
    await screenshot(`person-add-options-${width}`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Back to access list' }).click()
    await page.getByRole('button', { name: /^Remove View entities/ }).click()
    await page.getByRole('button', { name: 'Review changes', exact: true }).click()
    await page.getByRole('region', { name: 'Policy impact preview' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Save changes' }).isDisabled(), true)
    await screenshot(`person-preview-${width}`)
    await page.getByRole('button', { name: 'Back to editing' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    assert.equal(await page.getByRole('button', { name: 'Edit access', exact: true }).evaluate((element) => element === document.activeElement), true)
    await page.goto('http://localhost:5173/automations/access/users/u1')
    await page.getByRole('heading', { name: 'My access', exact: true }).waitFor()
    assert.match(page.url(), /\/automations\/access$/)
    assert.equal(await page.getByRole('button', { name: 'Add an action' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /^Remove / }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Review changes' }).count(), 0)
    await checkLayout(`self-person-${width}`)
    await screenshot(`self-person-${width}`)
    await page.goto('http://localhost:5173/automations/access')
    await page.getByRole('heading', { name: 'What you can do' }).waitFor()
    await checkLayout(`my-access-${width}`)
    await screenshot(`my-access-${width}`)
  }
  await page.getByRole('button', { name: 'Account options' }).click()
  await page.getByRole('link', { name: 'My account', exact: true }).click()
  await page.getByRole('heading', { name: 'My access', exact: true }).waitFor()
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'My API keys', exact: true }).click()
  await page.getByRole('heading', { name: 'My API keys', exact: true }).waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Account navigation' }).locator('[aria-current="page"]').count(), 1)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', output, checks: '3 widths, sidebar states, account keys, person detail, selectable tooltip, Escape and modal focus restoration' }))
} finally { await browser.close() }
