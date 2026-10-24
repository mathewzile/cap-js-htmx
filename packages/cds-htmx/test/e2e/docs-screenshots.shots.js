const { test, expect } = require('@playwright/test')
const path = require('node:path')

// The screenshots of the documentation (docs/images), taken from the running sample app: `npm run docs:screenshots`.
const OUT = path.join(__dirname, '..', '..', '..', '..', 'docs', 'images')
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const POE = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003'
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `phase8-${name}.png`) })

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

test.afterEach(async ({ request }) => {
  await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {})
  await request.delete(`/admin/Authors(ID=${POE},IsActiveEntity=false)`).catch(() => {})
})

test.describe('light', () => {
  test.use({ colorScheme: 'light' })

  test('list report, column menu, View Settings, value help', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    await shot(page, 'list-report')

    await page.locator('thead th[data-hf-sort=stock]').click({ button: 'right' })
    await expect(page.locator('.hf-colmenu')).toBeVisible()
    await shot(page, 'column-menu')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(page.locator('.hf-dialog').first()).toBeVisible()
    await page.waitForTimeout(600) // the dialog fades in
    await shot(page, 'dialog-view-settings')
    await page.keyboard.press('Escape')

    await page.locator('.hf-filter', { hasText: 'Author' }).locator('.hf-vh-open').click()
    await expect(page.locator('.hf-vh-row')).toHaveCount(4)
    await page.waitForTimeout(600)
    await shot(page, 'dialog-value-help')
  })

  test('object page, draft with a message', async ({ page }) => {
    await page.goto(ACTIVE)
    await expect(page.locator('#op-page')).toBeVisible()
    await shot(page, 'object-page')

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(page).toHaveURL(/IsActiveEntity=false/)
    const title = page.locator('[data-hf-field=title] input[name=title]')
    await title.fill('')
    await title.blur()
    await expect(page.locator('.hf-msg-button')).toHaveText('1')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await shot(page, 'object-page-draft')
  })

  test('tree table', async ({ page }) => {
    await page.goto('/htmx/admin/Genres')
    await expect(page.locator('#lr-table')).toHaveAttribute('role', 'treegrid')
    await page.locator('tr[data-hf-node^="10aaaaaa"] .hf-tree-toggle').click()
    await expect(page.locator('#lr-table-body > tr:not([hidden])')).toHaveCount(11)
    await shot(page, 'tree-table')
  })

  test('column layout in draft', async ({ page }) => {
    await page.goto('/manage-authors-htmx/webapp/index.html')
    await page.locator('#lr-table-body tr', { hasText: 'Edgar Allan Poe' }).click()
    await expect(page.locator('#op-page')).toBeVisible()
    await page.locator('#fcl-col-1').getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.locator('#fcl-col-1 .hf-page--edit')).toBeVisible()
    await page.locator('#fcl-col-1 #op-section--Awards tbody tr').first().locator('.hf-col-nav').click()
    await expect(page.locator('#c2-op-page')).toBeVisible()
    await page.waitForTimeout(1000)
    await page.evaluate(() => document.querySelectorAll('.hf-fcl__scroll').forEach(el => { el.scrollTop = 0 }))
    await page.mouse.move(700, 10)
    await shot(page, 'column-layout-draft')
  })
})

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' })

  test('dark theme', async ({ page }) => {
    await page.goto(ACTIVE)
    await expect(page.locator('#op-page')).toBeVisible()
    await shot(page, 'dark-theme')
  })
})
