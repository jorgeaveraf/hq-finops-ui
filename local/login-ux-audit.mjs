// Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core/index.mjs.
// Authentication requests are mocked; this script never changes application data.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const output = await mkdtemp(join(tmpdir(), 'finops-login-ux-'))
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/automations/api/**', (route) => route.fulfill({ status: 401, json: { message: 'Authentication required' } }))

try {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://localhost:5173/automations/login?auth_error=not_authorized')
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /isn't approved/)
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Sign in with password' }).count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: join(output, `denied-${width}.png`), fullPage: true })

    await page.getByRole('button', { name: 'Sign in with password' }).click()
    assert.match(await page.getByRole('form', { name: 'Local sign-in' }).getByRole('alert').innerText(), /Username and password are required/)
    assert.match(await page.getByRole('alert').first().innerText(), /isn't approved/)
    await page.screenshot({ path: join(output, `local-error-${width}.png`), fullPage: true })

    await page.goto('http://localhost:5173/automations/login')
    assert.equal(await page.getByRole('alert').count(), 0)
    await page.screenshot({ path: join(output, `default-${width}.png`), fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', output, checks: 'Google denial, local validation, default state, desktop and mobile, no overflow or browser errors' }))
} finally {
  await browser.close()
}
