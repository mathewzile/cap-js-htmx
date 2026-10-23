const { test, expect } = require('@playwright/test')

test.describe('column menu opens on a click on the header', () => {
  test('a left click opens the menu under the header instead of sorting; a second click closes it', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    const header = page.locator('thead th[data-hf-sort=stock]')
    const menu = page.locator('.hf-colmenu')
    const firstRow = () => page.locator('#lr-table-body tr').first().locator('td.hf-col-3').textContent()
    const before = await firstRow()

    await header.click()
    await expect(menu).toBeVisible()
    await expect(header).not.toHaveAttribute('aria-sort', /.+/) // not sorted by the click
    expect(await firstRow()).toBe(before)
    const [h, m] = [await header.boundingBox(), await menu.boundingBox()]
    expect(Math.abs(m.x - h.x)).toBeLessThan(4) // under the header cell
    expect(m.y).toBeGreaterThanOrEqual(h.y + h.height - 2)

    await header.click()
    await expect(menu).toHaveCount(0)
    await header.click()
    await expect(menu).toBeVisible()
  })

  test('sorting is an entry of the menu and keeps the filters', async ({ page }) => {
    await page.goto('/htmx/catalog/Books?$search=Crimson')
    const header = page.locator('thead th[data-hf-sort=stock]')
    await header.click()
    await page.locator('.hf-colmenu').getByRole('menuitem', { name: 'Sort Descending' }).click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    const titles = await page.locator('#lr-table-body td.hf-col-0').allTextContents()
    expect(titles.length).toBeGreaterThan(0)
    expect(titles.every(t => /Crimson/.test(t))).toBe(true) // the search survived the sort
  })

  test('a section table header opens it too, a column without a sort link as well', async ({ page }) => {
    await page.goto("/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)")
    const header = page.locator('#op-section--Books thead th.hf-th').first()
    await header.click()
    await expect(page.locator('.hf-colmenu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.hf-colmenu')).toHaveCount(0)
  })
})
