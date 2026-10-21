const { test, expect } = require('@playwright/test')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

// Phase 9: the frontend shell (cds-htmx-shell) in front of a real @sap/approuter, the way the HTML5 app runs under Work Zone:
// the app is served under a prefix (/wz/mb) and /htmx/** goes through the approuter route to CAP.

const ROUTER = 'http://localhost:5055'
const APP = `${ROUTER}/wz/mb/index.html`
let router

test.beforeAll(async () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', '..', '..', 'cds-htmx-shell', 'scripts', 'build-app.mjs'), path.join(__dirname, '..', '..', '..', '..', 'app', 'manage-books-htmx')])
  // the approuter serves the built app from its own folder (it refuses a localDir outside it)
  const resources = path.join(__dirname, '..', 'approuter', 'resources')
  fs.rmSync(resources, { recursive: true, force: true })
  fs.cpSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'manage-books-htmx', 'dist', 'app'), resources, { recursive: true })
  router = spawn(process.execPath, [require.resolve('@sap/approuter/approuter.js')], {
    cwd: path.join(__dirname, '..', 'approuter'),
    env: { ...process.env, PORT: '5055', destinations: JSON.stringify([{ name: 'cap-htmx-srv', url: 'http://localhost:4004' }]) },
    stdio: 'ignore'
  })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${ROUTER}/wz/mb/manifest.json`)).ok) return } catch { /* still starting */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('the approuter did not start')
})
test.afterAll(() => { router?.kill() })

const rows = page => page.locator('#lr-table-body > tr[id^=lr-row--]')
const BOOK = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000002',IsActiveEntity=true"

test.describe('the shell behind the approuter', () => {
  test('boots, takes assets and pages from /wz/mb/htmx/**, and puts the route into the hash', async ({ page }) => {
    const requests = []
    page.on('request', r => requests.push(r.url()))
    await page.goto(APP)
    await expect(page.locator('.hf-table-toolbar__title')).toContainText('Books (1,005)')
    await expect(rows(page)).toHaveCount(20)
    await expect(page).toHaveURL(/index\.html#\/htmx\/catalog\/Books$/)
    // every backend request went through the prefix and the approuter route; assets are at the versioned path
    const backend = requests.filter(u => u.includes('/htmx/'))
    expect(backend.length).toBeGreaterThan(5)
    expect(backend.every(u => u.startsWith(`${ROUTER}/wz/mb/htmx/`))).toBe(true)
    expect(backend.some(u => /\/htmx\/-\/v[0-9a-f]{10}\/public\/htmx-fiori\.js/.test(u))).toBe(true)
    // plugin styles are scoped to the container, not the page
    expect(await page.evaluate(() => [document.body.className, document.getElementById('root').className])).toEqual(['', 'htmx-fiori hf-root is-compact'])
    await page.screenshot({ path: 'test-results/phase9/shell-list.png' })
  })

  test('opening a row, Back and Forward move through the hash; a deep link opens the object', async ({ page }) => {
    await page.goto(APP)
    await expect(rows(page)).toHaveCount(20)
    await page.locator('#lr-row--3d2d2d2d-1c1c-4b4b-8a8a-000000000002-true').click()
    await expect(page.locator('#op-page')).toBeVisible()
    await expect(page).toHaveURL(/#\/htmx\/catalog\/Books\(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000002',IsActiveEntity=true\)$/)
    await page.goBack()
    await expect(page.locator('#lr-table')).toBeVisible()
    await expect(page).toHaveURL(/#\/htmx\/catalog\/Books$/)
    await page.goForward()
    await expect(page.locator('#op-page')).toBeVisible()
    await page.reload() // a reload reopens the same page
    await expect(page.locator('#op-page h1')).toHaveText('Jane Eyre')
    await page.goto(`${APP}#/htmx/catalog/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true)`)
    await page.reload()
    await expect(page.locator('#op-page h1')).toHaveText('Wuthering Heights')
  })

  test('List Report state is kept in the hash too (sort and filter replace, they do not push)', async ({ page }) => {
    await page.goto(APP)
    await page.locator('thead th[data-hf-sort=stock] a').click()
    await expect(page.locator('thead th[data-hf-sort=stock]')).toHaveAttribute('aria-sort', 'ascending')
    await expect(page).toHaveURL(/#\/htmx\/catalog\/Books\?(\$|%24)orderby=stock/)
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(3)
  })

  test('the event stream is opened through the approuter and stays open', async ({ page }) => {
    const stream = page.waitForResponse(r => r.url().includes('/$events'))
    await page.goto(APP)
    const res = await stream
    expect(res.url()).toContain('/wz/mb/htmx/catalog/$events?client=')
    expect(res.url()).toContain('app=managebooks.htmx%401.0.0')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('text/event-stream')
    expect(res.headers()['content-encoding']).toBeUndefined()
  })
})

test.describe('CSRF token of the approuter', () => {
  // A stand-in for the approuter's token handling (the real one needs XSUAA): a token is handed out for `X-CSRF-Token: Fetch`,
  // writes without the current one are refused with 403 + `x-csrf-token: Required`.
  async function csrf(page, state) {
    await page.route('**/wz/mb/htmx/**', async route => {
      const request = route.request()
      const headers = request.headers()
      if (request.method() === 'GET' && headers['x-csrf-token'] === 'Fetch') {
        state.fetches++
        const response = await route.fetch()
        return route.fulfill({ response, headers: { ...response.headers(), 'x-csrf-token': state.token } })
      }
      if (!/^(GET|HEAD|OPTIONS)$/.test(request.method())) {
        state.writes.push(headers['x-csrf-token'])
        if (headers['x-csrf-token'] !== state.token) return route.fulfill({ status: 403, headers: { 'x-csrf-token': 'Required' }, body: 'CSRF token validation failed' })
      }
      return route.continue()
    })
  }

  test('a write carries the token, and after a 403 "Required" the token is fetched again and the write repeated once', async ({ page }) => {
    const state = { token: 'token-1', fetches: 0, writes: [] }
    await csrf(page, state)
    await page.goto(`${APP}#/htmx/catalog/Books(${BOOK})`)
    await expect(page.locator('#op-page h1')).toHaveText('Jane Eyre')

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(page.locator('#op-page.hf-page--edit')).toBeVisible()
    expect(state.writes).toEqual(['token-1'])
    expect(state.fetches).toBe(1)

    state.token = 'token-2' // the session changed: the next write is refused once
    await page.locator('input[name=stock]').fill('42')
    await page.locator('input[name=stock]').blur()
    await expect.poll(() => state.writes.length).toBe(3)
    expect(state.writes.slice(1)).toEqual(['token-1', 'token-2'])
    expect(state.fetches).toBe(2)

    // clean up: discard the draft
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await page.getByRole('button', { name: /Discard/ }).last().click()
    await expect(page.locator('#op-page.hf-page--edit')).toHaveCount(0)
  })
})
