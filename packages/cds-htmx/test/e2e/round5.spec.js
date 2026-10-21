const { test, expect } = require('@playwright/test')

// Round 5: tree table, column menu, paging through 1000+ rows, date filters

const rows = page => page.locator('#lr-table-body > tr[id^=lr-row--]:not([hidden])')

test.describe('paging through 1,005 books', () => {
  test('"More" shows [loaded / total] and loads the next page until everything is there', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('.hf-table-toolbar__title')).toContainText('Books (1,005)')
    await expect(rows(page)).toHaveCount(20)
    const more = page.locator('#lr-growing .hf-table__growing-button')
    await expect(more).toContainText('[ 20 / 1,005 ]')
    await more.click()
    await expect(rows(page)).toHaveCount(40)
    await expect(more).toContainText('[ 40 / 1,005 ]') // the same button now asks for the rows after those 40
    await more.click()
    await expect(rows(page)).toHaveCount(60)
    // a different sort starts again at the first page and keeps the trigger in step
    await page.locator('thead th[data-hf-sort=stock] a').click()
    await expect(rows(page)).toHaveCount(20)
    await expect(more).toContainText('[ 20 / 1,005 ]')
    await expect(page.locator('thead th[data-hf-sort=stock]')).toHaveAttribute('aria-sort', 'ascending')
  })

  test('a filter shrinks the total and the trigger', async ({ page }) => {
    await page.goto('/htmx/catalog/Books?f.stock.le=0')
    const total = Number((await page.locator('#lr-count').textContent()).replace(/,/g, ''))
    expect(total).toBeGreaterThan(20)
    expect(total).toBeLessThan(1005)
  })
})

test.describe('date filters (manage-authors)', () => {
  test('dateOfBirth with SingleRange is one date range control', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    const range = page.locator('[data-hf-filter=dateOfBirth] .hf-date-range')
    await expect(range).toBeVisible()
    await expect(page.locator('#lr-table-body > tr[id^=lr-row--]')).toHaveCount(4)
    await range.locator('input').first().fill('1810-01-01')
    await range.locator('input').last().fill('1820-12-31')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await expect(page.locator('#lr-table-body > tr[id^=lr-row--]')).toHaveCount(2)
    await expect(page).toHaveURL(/f\.dateOfBirth\.ge=1810-01-01&f\.dateOfBirth\.le=1820-12-31/)
    await page.screenshot({ path: 'test-results/round5/authors-date-range.png' })
  })
})

test.describe('column menu', () => {
  test('right click on a header opens the menu; sort descending sorts the list on the server', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    const header = page.locator('thead th[data-hf-sort=stock]')
    await header.click({ button: 'right' })
    const menu = page.locator('.hf-colmenu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toContainText(['Sort Ascending', 'Sort Descending', 'Group', 'Filter', 'Hide Column', 'Columns...'])
    await page.screenshot({ path: 'test-results/round5/column-menu.png' })
    await menu.getByRole('menuitem', { name: 'Sort Descending' }).click()
    await expect(menu).toHaveCount(0)
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(rows(page)).toHaveCount(20)
    const stocks = await page.locator('#lr-table-body td.hf-col-3').allTextContents()
    expect(stocks.length).toBe(20)
    expect(stocks.map(Number)).toEqual([...stocks.map(Number)].sort((a, b) => b - a))
  })

  test('Hide Column and Escape', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    const header = page.locator('thead th[data-hf-sort=stock]')
    await header.click({ button: 'right' })
    await page.keyboard.press('Escape')
    await expect(page.locator('.hf-colmenu')).toHaveCount(0)
    await header.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Hide Column' }).click()
    await expect(header).toBeHidden()
    await page.evaluate(() => localStorage.clear())
  })

  test('Filter focuses the column\'s filter field', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('thead th[data-hf-sort=stock]').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Filter' }).click()
    await expect(page.locator('[data-hf-filter=stock] input')).toBeFocused()
    await page.evaluate(() => localStorage.clear())
  })

  test('an Object Page section table has the menu too (sorts the rows on the page)', async ({ page }) => {
    await page.goto("/htmx/catalog/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true)")
    const section = page.locator('[data-hf-view^="section:"]').first()
    const header = section.locator('thead th.hf-th').first()
    await header.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Sort Descending' }).click()
    const titles = await section.locator('tbody td.hf-col-0').allTextContents()
    expect(titles.map(t => t.trim())).toEqual([...titles.map(t => t.trim())].sort().reverse())
  })
})

test.describe('tree table (browse-genres)', () => {
  test('top level first; expanding loads children once; collapsing hides them again', async ({ page }) => {
    await page.goto('/htmx/admin/Genres')
    await expect(page.locator('#lr-table')).toHaveAttribute('role', 'treegrid')
    await expect(rows(page)).toHaveCount(2)
    const fiction = page.locator('tr[data-hf-node^="10aaaaaa"]')
    const requests = []
    page.on('request', r => { if (r.url().includes('$children')) requests.push(r.url()) })
    await fiction.locator('.hf-tree-toggle').click()
    await expect(rows(page)).toHaveCount(2 + 9)
    await expect(fiction).toHaveAttribute('data-hf-state', 'expanded')
    // Fantasy (level 1) expands one level further
    await page.locator('tr[data-hf-node^="13aaaaaa"] .hf-tree-toggle').click()
    await expect(rows(page)).toHaveCount(2 + 9 + 4)
    await page.screenshot({ path: 'test-results/round5/tree.png' })
    // collapse Fiction: everything below goes, Fantasy stays expanded inside
    await fiction.locator('.hf-tree-toggle').click()
    await expect(rows(page)).toHaveCount(2)
    await fiction.locator('.hf-tree-toggle').click()
    await expect(rows(page)).toHaveCount(2 + 9 + 4)
    expect(requests).toHaveLength(2) // nothing is fetched twice
  })

  test('search shows the matches with the ancestors that lead to them', async ({ page }) => {
    await page.goto('/htmx/admin/Genres')
    await page.locator('#lr-search').fill('Noir')
    await page.locator('#lr-search').press('Enter')
    await expect(rows(page)).toHaveCount(7)
    await expect(page.locator('tr[data-hf-node^="1621aaaa"]')).toHaveAttribute('data-hf-level', '3')
  })
})

test.describe('busy state and failures', () => {
  const overlayOpacity = (page, selector) => page.evaluate(sel => Number(getComputedStyle(document.querySelector(sel), '::before').opacity), selector)

  test('a slow table request shows the busy overlay after about a second, a quick one never does', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.route('**/$table**', async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue() })
    await page.locator('#lr-growing .hf-table__growing-button').click()
    const card = page.locator('.hf-table-card')
    await expect(card).toHaveClass(/hf-busy/)
    await expect(card).toHaveAttribute('aria-busy', 'true')
    expect(await overlayOpacity(page, '.hf-table-card')).toBe(0) // not yet: the delay
    await page.waitForTimeout(1500)
    expect(await overlayOpacity(page, '.hf-table-card')).toBeGreaterThan(0)
    await page.screenshot({ path: 'test-results/round5/busy.png' })
    await expect(rows(page)).toHaveCount(40)
    await expect(card).not.toHaveClass(/hf-busy/)
  })

  test('opening a row with a slow backend makes the whole page busy', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.route('**/Books(ID=*', async route => { await new Promise(r => setTimeout(r, 1800)); await route.continue() })
    await rows(page).first().click()
    await expect(page.locator('#app')).toHaveClass(/hf-busy/)
    await expect(page.locator('#op-page')).toBeVisible()
    await expect(page.locator('#app')).not.toHaveClass(/hf-busy/)
  })

  test('a failed request says so and leaves the page as it was', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.route('**/$table**', route => route.abort('connectionrefused'))
    await page.locator('#lr-growing .hf-table__growing-button').click()
    await expect(page.locator('#messages .fd-message-strip--error')).toContainText('could not be completed')
    await expect(rows(page)).toHaveCount(20)
    await expect(page.locator('.hf-table-card')).not.toHaveClass(/hf-busy/)
  })

  test('a server error is not swapped into the table', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.route('**/$table**', route => route.fulfill({ status: 500, contentType: 'text/html', body: '<tr><td>boom</td></tr>' }))
    await page.locator('#lr-growing .hf-table__growing-button').click()
    await expect(page.locator('#messages .fd-message-strip--error')).toBeVisible()
    await expect(page.locator('#lr-table-body')).not.toContainText('boom')
  })
})

test('expanding tree nodes does not change the column widths', async ({ page }) => {
  await page.goto('/htmx/admin/Genres')
  const widths = () => page.locator('#lr-table thead th').evaluateAll(ths => ths.map(th => Math.round(th.getBoundingClientRect().width)))
  const before = await widths()
  await page.locator('tr[data-hf-node^="10aaaaaa"] .hf-tree-toggle').click()
  await page.locator('tr[data-hf-node^="13aaaaaa"] .hf-tree-toggle').click()
  await expect(rows(page)).toHaveCount(15)
  await page.locator('tr[data-hf-node^="134aaaaa"]').waitFor()
  expect(await widths()).toEqual(before)
  await page.screenshot({ path: 'test-results/round5/tree-fixed.png' })
})
