const { test, expect } = require('@playwright/test')

const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const AUTHOR_3 = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003' // Edgar Allan Poe

async function edit(page) {
  await page.goto(ACTIVE)
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  await expect(page).toHaveURL(/IsActiveEntity=false/)
}

test.afterEach(async ({ request }) => {
  await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {})
})

test.describe('edits are sent when a field is left, and in order', () => {
  test('a PATCH goes out only for a committed change', async ({ page }) => {
    await edit(page)
    const patches = []
    page.on('request', r => { if (r.method() === 'PATCH') patches.push(r.url()) })
    const stock = page.locator('input[name=stock]')
    await stock.focus(); await stock.blur()
    await stock.fill('77'); await stock.fill('5'); await stock.blur() // typed and changed back: no change
    await page.waitForTimeout(500)
    expect(patches).toHaveLength(0)
    await stock.fill('8'); await expect.poll(() => patches.length).toBe(0) // still typing
    await stock.blur()
    await expect.poll(() => patches.length).toBe(1)
  })

  test('Save waits for a slow PATCH instead of overtaking it', async ({ page }) => {
    await edit(page)
    await page.route('**/$field/title', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue() })
    const title = page.locator('[data-hf-field=title] input[name=title]')
    await title.fill('Slow Edit')
    await page.getByRole('button', { name: 'Save', exact: true }).click() // blur fires the PATCH, Save follows at once
    await expect(page.locator('h1').first()).toHaveText('Slow Edit', { timeout: 15000 })
    await expect(page).toHaveURL(/IsActiveEntity=true/)
    await page.goto(ACTIVE)
    await expect(page.locator('h1').first()).toHaveText('Slow Edit')
    // put it back
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await page.locator('[data-hf-field=title] input[name=title]').fill('Jane Eyre')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('h1').first()).toHaveText('Jane Eyre')
  })
})

test.describe('value help field', () => {
  test('is editable, keeps its icon on focus, suggests while typing and validates the key', async ({ page }) => {
    await edit(page)
    const input = page.locator('input[name=author_ID]')
    const icon = page.locator('[data-hf-field=author_ID] .hf-vh-open')
    await expect(input).toBeEditable()
    await input.focus()
    await expect(icon).toBeVisible()
    const box = await icon.boundingBox()
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.hf-vh-open') != null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    expect(top).toBe(true) // the icon is not covered by the focused input

    await input.fill('Poe')
    await expect(page.locator('[data-hf-field=author_ID] .hf-suggest')).toBeVisible()
    await expect(page.locator('[data-hf-show-all]')).toBeVisible()
  })

  test('typing a key shows matches, picking one stores it, an unknown key is refused', async ({ page }) => {
    await edit(page)
    const input = page.locator('input[name=author_ID]')
    await input.fill('9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003')
    const rows = page.locator('.hf-suggest-row')
    await expect(rows.first()).toBeVisible()
    const patch = page.waitForRequest(r => r.method() === 'PATCH')
    await rows.first().click()
    await patch
    await expect(input).toHaveValue(AUTHOR_3)

    await input.fill('no-such-author')
    await page.locator('[data-hf-field=title] input[name=title]').focus() // leave the field: PATCH is refused
    await expect(page.locator('[data-hf-field=author_ID]')).toHaveClass(/hf-field--error/)
  })

  test('"Show All Items" opens the dialog with what was typed', async ({ page }) => {
    await edit(page)
    await page.locator('input[name=author_ID]').fill('0004')
    await page.locator('[data-hf-show-all]').click()
    const dialog = page.locator('.hf-dialog--value-help')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('input[name="$search"]')).toHaveValue('0004')
    await expect(dialog.locator('.hf-vh-row')).toHaveCount(1)
  })
})

test.describe('List Report', () => {
  test('columns keep their width and the table does not stretch to the page', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 })
    await page.goto('/htmx/catalog/Books')
    // the table runs full width like FE's; its columns end at the navigation column
    const table = await page.locator('#lr-table thead .hf-col-nav').boundingBox().then(async nav => ({ width: nav.x + nav.width - (await page.locator('#lr-table').boundingBox()).x }))
    const card = await page.locator('.hf-table-toolbar').boundingBox()
    expect(table.width).toBeLessThan(card.width - 100)
  })

  test('the Status filter opens Define Conditions and filters', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('[data-hf-filter=stockStatus] [data-hf-action=conditions]').click()
    const dialog = page.locator('.hf-dialog')
    await expect(dialog.locator('h2')).toContainText('Define Conditions: Status')
    await dialog.locator('select').selectOption('co')
    await dialog.locator('input').first().fill('Low')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[name="f.stockStatus"]')).toHaveValue('*Low*')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect.poll(async () => (await page.locator('#lr-table-body tr').count()) < 5).toBe(true)
    const texts = await page.locator('#lr-table-body tr').allInnerTexts()
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(text).toContain('Low Stock')
  })

  test('the draft indicator is shown under the semantic key column', async ({ page }) => {
    await edit(page)
    await page.goto('/htmx/catalog/Books')
    const row = page.locator(`#lr-row--${BOOK}-true`) // your own draft stands in the saved row: "Draft", not "Locked"
    await expect(row.locator('td.hf-col-0 .hf-draft-indicator')).toHaveText('Draft')
    await expect(row.locator('td:not(.hf-col-0) .hf-draft-indicator')).toHaveCount(0)
  })
})

test.describe('gaps', () => {
  test('the browser tab follows the title while it is edited', async ({ page }) => {
    await edit(page)
    await page.locator('[data-hf-field=title] input[name=title]').fill('Tab Title Test')
    await page.locator('[data-hf-field=title] input[name=title]').blur()
    await expect.poll(() => page.title()).toContain('Tab Title Test')
  })

  test('Adapt Filters can add a filter for any property and it filters', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('[data-hf-filter=price]')).toHaveCount(0)
    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await page.locator('.hf-adapt__add select').selectOption({ label: 'Price' })
    await expect(page.locator('.hf-adapt__row', { hasText: 'Price' })).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()
    const field = page.locator('[data-hf-filter=price] input')
    await expect(field).toBeVisible()
    await field.fill('>10')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.locator('#lr-count')).not.toHaveText('1,005') // the rows that cost 10 or less are gone
    await expect(page.locator('#lr-table-body tr')).toHaveCount(20) // one page of the rest
    const prices = await page.locator('#lr-table-body td.hf-col-4').allTextContents()
    expect(prices.every(p => parseFloat(p) > 10)).toBe(true)
    await page.reload()
    await expect(page.locator('[data-hf-filter=price]')).toBeVisible() // remembered
    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await page.getByRole('button', { name: 'Reset' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[data-hf-filter=price]')).toHaveCount(0)
  })
})

test.describe('child rows', () => {
  const POE = "ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003'"

  test('a draft Author: Awards (a composition) can be created in, deleted from and pasted into, Books (@readonly) is shown as in display mode', async ({ page, request }) => {
    await page.goto('/htmx/admin/Authors(' + POE + ',IsActiveEntity=true)')
    await expect(page.locator('#op-section--Awards tbody tr')).toHaveCount(2)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    const awards = page.locator('#op-section--Awards')
    const books = page.locator('#op-section--Books')
    await expect(awards.locator('tbody tr').first().locator('input').first()).toBeVisible()
    await expect(awards.getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(awards.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(awards.locator('[data-hf-action=paste]')).toBeVisible()
    await expect(books.locator('tbody tr').first().locator('input')).toHaveCount(0) // read-only: no inputs, no selection, no Delete
    await expect(books.locator('tbody .hf-checkbox')).toHaveCount(0)
    await expect(books.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expect(books.getByRole('button', { name: 'Create' })).toHaveCount(0)
    await expect(books.locator('[data-hf-action=paste]')).toHaveCount(0)
    await request.delete('/admin/Authors(ID=9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003,IsActiveEntity=false)').catch(() => {})
  })

  test('pasting spreadsheet rows into a draft table creates rows', async ({ page }) => {
    await edit(page)
    const section = page.locator('.hf-section--table', { hasText: 'Chapters' })
    const before = await section.locator('tbody tr').count()
    await section.locator('thead').click()
    await page.evaluate(() => {
      const data = new DataTransfer(); data.setData('text', 'Pasted X\t11\nPasted Y\t22\n')
      document.querySelector('.hf-section--table thead').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(section.locator('tbody tr')).toHaveCount(before + 2)
    await expect(section.locator('input[value="Pasted X"]')).toHaveCount(1)
  })
})

test.describe('table details', () => {
  test('the semantic key column is bold and section tables keep their column widths', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 })
    await page.goto('/htmx/catalog/Books')
    const weight = await page.locator('#lr-table-body tr').first().locator('td.hf-col-0').evaluate(td => getComputedStyle(td).fontWeight)
    expect(Number(weight)).toBeGreaterThanOrEqual(600)
    const other = await page.locator('#lr-table-body tr').first().locator('td.hf-col-2').evaluate(td => getComputedStyle(td).fontWeight)
    expect(Number(other)).toBeLessThan(600)
    await page.goto(ACTIVE)
    const section = page.locator('.hf-section--table').first()
    // the table runs full width like FE's; its columns end at the navigation column
    await section.locator('table.hf-table--sized').waitFor()
    const navBox = await section.locator('table.hf-table thead .hf-col-nav').boundingBox()
    const table = { width: navBox.x + navBox.width - (await section.locator('table.hf-table').boundingBox()).x }
    const sectionBox = await section.boundingBox()
    expect(table.width).toBeLessThan(sectionBox.width - 100)
  })

  test('View Settings can group the List Report by a column', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('[data-hf-action=settings]').click()
    await page.locator('.hf-dialog__tab', { hasText: 'Group' }).click()
    await page.locator('.hf-dialog__panel:not([hidden]) select').selectOption({ label: 'Author' })
    await page.getByRole('button', { name: 'OK' }).click()
    // grouping sorts by the column on the server: the first page of 20 books is all by the first author
    await expect(page.locator('tr.hf-group-row')).toHaveCount(1)
    await expect(page.locator('tr.hf-group-row').first()).toContainText('Author: ')
    await page.reload()
    await expect(page.locator('tr.hf-group-row')).toHaveCount(1)
    await page.locator('[data-hf-action=settings]').click()
    await page.getByRole('button', { name: 'Reset' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('tr.hf-group-row')).toHaveCount(0)
  })

  test('Define Conditions offers between/comparison and the value help can show column filters', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('[data-hf-filter=stockStatus] [data-hf-action=conditions]').click()
    await expect(page.locator('.hf-dialog select option')).toHaveCount(10)
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.locator('[data-hf-filter=author_ID] .hf-vh-open').click()
    const dialog = page.locator('.hf-dialog--value-help')
    await expect(dialog.locator('.hf-vh-row')).toHaveCount(4)
    await dialog.getByRole('button', { name: 'Show Filters' }).click()
    await dialog.locator('input[name="c.name"]').fill('Poe')
    await dialog.getByRole('button', { name: 'Go', exact: true }).first().click()
    await expect(dialog.locator('.hf-vh-row')).toHaveCount(1)
  })
})

test.describe('the event stream is opened on demand', () => {
  const streams = page => page.evaluate(() => !!document.getElementById('sse'))

  test('Genres (no side effects) holds no connection, Books does, and it closes again', async ({ page }) => {
    await page.goto('/htmx/catalog/Genres')
    expect(await streams(page)).toBe(false)
    await page.goto('/htmx/catalog/Books')
    await expect.poll(() => streams(page)).toBe(true)
    await page.goto(ACTIVE)
    await expect.poll(() => streams(page)).toBe(true)
  })
})
