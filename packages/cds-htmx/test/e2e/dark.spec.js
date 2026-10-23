const { test, expect } = require('@playwright/test')

// Needs the server on `theme: auto` (the Playwright web server starts it that way, CDS_HTMX_THEME=auto).
const BOOK = "/htmx/catalog/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000002',IsActiveEntity=true)"

test.beforeEach(async ({ request }) => {
  const info = await (await request.get('/htmx/catalog/$shell', { headers: { 'HX-Request': 'true' } })).json()
  test.skip(!info.auto, 'the server is not running with theme auto')
})

/** Perceived brightness (0 black .. 255 white) of a computed CSS color. */
const brightness = color => {
  const [r, g, b] = color.match(/[\d.]+/g).map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const background = (page, selector) => page.locator(selector).first().evaluate(el => {
  for (let node = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
  }
  return 'rgb(255, 255, 255)'
})
const textColor = (page, selector) => page.locator(selector).first().evaluate(el => getComputedStyle(el).color)

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' })

  test('List Report, Object Page and a dialog are dark, text is light', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    expect(brightness(await background(page, 'body'))).toBeLessThan(80)
    expect(brightness(await background(page, '.hf-table-card, .fd-table'))).toBeLessThan(80)
    expect(brightness(await textColor(page, '#lr-table-body td'))).toBeGreaterThan(150)

    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(page.locator('.hf-dialog, .hf-overlay [role=dialog]').first()).toBeVisible()
    expect(brightness(await background(page, '.hf-dialog, .hf-overlay [role=dialog]'))).toBeLessThan(80)
    await page.keyboard.press('Escape')

    await page.goto(BOOK)
    await expect(page.locator('#op-page')).toBeVisible()
    expect(brightness(await background(page, '.hf-section__card'))).toBeLessThan(80)
    expect(brightness(await textColor(page, '.hf-op-title__heading'))).toBeGreaterThan(150)
  })

  test('the column layout and its separator are dark too', async ({ page }) => {
    await page.goto("/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)")
    await expect(page.locator('#op-page')).toBeVisible()
    await page.waitForTimeout(800)
    expect(brightness(await background(page, '#fcl-col-1'))).toBeLessThan(80)
    await page.locator('#fcl-col-1 [data-hf-sep]').hover()
    expect(brightness(await background(page, '.hf-fcl__grip'))).toBeLessThan(120)
  })

  test('the shell follows the browser, also when it changes while the page is open', async ({ page }) => {
    await page.goto('/manage-books-htmx/webapp/index.html')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    expect(brightness(await background(page, '.hf-root'))).toBeLessThan(80)
    expect(await page.locator('#hf-theme').getAttribute('href')).toContain('sap_horizon_dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(async () => brightness(await background(page, '.hf-root'))).toBeGreaterThan(200)
    expect(await page.locator('#hf-theme').getAttribute('href')).not.toContain('dark')
    expect(await page.locator('#hf-variables').getAttribute('href')).not.toContain('dark')
  })
})

test.describe('light', () => {
  test.use({ colorScheme: 'light' })
  test('the same pages are light', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    expect(brightness(await background(page, 'body'))).toBeGreaterThan(200)
    expect(brightness(await textColor(page, '#lr-table-body td'))).toBeLessThan(100)
  })
})
