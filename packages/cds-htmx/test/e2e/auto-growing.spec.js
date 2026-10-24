const { test, expect } = require('@playwright/test')

test.describe('auto growing', () => {
  test('scrolling to the bottom of the List Report loads the next rows', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    const rows = page.locator('#lr-table-body tr.fd-table__row')
    await expect(rows).toHaveCount(20)

    const toBottom = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await toBottom()
    await expect(rows).toHaveCount(40)
    await expect(page.locator('#lr-growing .hf-table__growing-info')).toContainText('40 /')

    await toBottom()
    await expect(rows).toHaveCount(60)
  })

  test('nothing loads until the button is near the viewport', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr.fd-table__row')).toHaveCount(20)
    await page.waitForTimeout(500)
    await expect(page.locator('#lr-table-body tr.fd-table__row')).toHaveCount(20)
  })

  test('Object Page table sections do not grow by themselves', async ({ page }) => {
    await page.goto("/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)")
    const rows = page.locator('#op-section--Books tbody tr[hx-get]')
    await expect(rows).toHaveCount(10)
    await page.locator('#op-section--Books-growing').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(rows).toHaveCount(10)
  })
})

test.describe('table rows', () => {
  test('the filler after the last column is not part of the row: no hover tint, no press', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    const row = page.locator('#lr-table-body tr').first()
    await expect(row).toBeVisible()
    const fill = row.locator('.hf-col-fill')
    expect(await fill.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none')
    const box = await fill.boundingBox()
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('tr')?.id ?? null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    expect(hit).toBeNull()
  })

  test('the filler after the last column has no row line and does not open the row', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    const fill = page.locator('#lr-table-body tr').first().locator('.hf-col-fill')
    expect(await fill.evaluate(el => getComputedStyle(el).borderBottomWidth)).toBe('0px')
    expect(await page.locator('#lr-table-body tr').first().locator('.hf-col-nav').evaluate(el => getComputedStyle(el).borderBottomWidth)).toBe('1px')

    const box = await fill.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(400)
    expect(new URL(page.url()).pathname).toBe('/htmx/catalog/Books')
    await page.locator('#lr-table-body tr').first().locator('td').nth(1).click()
    await expect(page.locator('#op-page')).toBeVisible()
  })
})
