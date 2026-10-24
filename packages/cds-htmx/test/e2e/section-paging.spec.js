const { test, expect } = require('@playwright/test')

const AUTHOR = "/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)"

test.describe('Object Page table sections page like the List Report', () => {
  const section = page => page.locator('#op-section--Books')
  const rows = page => section(page).locator('tbody tr[hx-get]')
  const count = async page => Number((await page.locator('#op-section--Books-count').textContent()).replace(/[^\d]/g, ''))

  test('first page, More with [loaded / total], the title keeps the total', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(rows(page).first()).toBeVisible()
    const total = await count(page)
    expect(total).toBeGreaterThan(40)
    await expect(rows(page)).toHaveCount(10)
    const more = page.locator('#op-section--Books-growing .hf-table__growing-button')
    await expect(more).toContainText(`[ 10 / ${total.toLocaleString('en')} ]`)
    await more.click()
    await expect(rows(page)).toHaveCount(20)
    await expect(more).toContainText(`[ 20 / ${total.toLocaleString('en')} ]`)
    expect(await count(page)).toBe(total)
  })

  test('search runs over the whole set and shrinks the total', async ({ page }) => {
    await page.goto(AUTHOR)
    const total = await count(page)
    await section(page).locator('[data-hf-table-search]').fill('Crimson')
    await expect.poll(() => count(page)).toBeLessThan(total)
    const titles = await rows(page).locator('td.hf-col-0').allTextContents()
    expect(titles.length).toBeGreaterThan(0)
    expect(titles.every(t => /Crimson/i.test(t))).toBe(true)
    await section(page).locator('[data-hf-table-search]').fill('')
    await expect.poll(() => count(page)).toBe(total)
  })

  test('the column menu sorts the whole set, More keeps the sort', async ({ page }) => {
    await page.goto(AUTHOR)
    const header = section(page).locator('thead th[data-hf-sort=title]')
    await header.click()
    await page.locator('.hf-colmenu').getByRole('menuitem', { name: 'Sort Descending' }).click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(async () => (await rows(page).first().locator('td.hf-col-0').textContent())).toMatch(/^[W-Z]/)
    const first = await rows(page).locator('td.hf-col-0').allTextContents()
    expect(first).toEqual([...first].sort((a, b) => b.localeCompare(a)))
    await page.locator('#op-section--Books-growing .hf-table__growing-button').click()
    await expect(rows(page)).toHaveCount(20)
    const all = await rows(page).locator('td.hf-col-0').allTextContents()
    expect(all).toEqual([...all].sort((a, b) => b.localeCompare(a)))
  })

  test('export is every row, not the page', async ({ page }, testInfo) => {
    await page.goto(AUTHOR)
    const total = await count(page)
    const [download] = await Promise.all([page.waitForEvent('download'), section(page).locator('.hf-icon-button[data-hf-action=export-section]').click()])
    const file = testInfo.outputPath('books.csv')
    await download.saveAs(file)
    const lines = require('node:fs').readFileSync(file, 'utf8').trim().split(/\r?\n/)
    expect(lines.length - 1).toBe(total)
  })

  test('a row still opens the book in the next column', async ({ page }) => {
    await page.goto(AUTHOR)
    await page.locator('#op-section--Books-growing .hf-table__growing-button').click()
    await expect(rows(page)).toHaveCount(20)
    await rows(page).nth(15).click() // a row of the second page
    await expect(page.locator('#c2-op-page')).toBeVisible()
  })
})
