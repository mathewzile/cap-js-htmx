const { test, expect } = require('@playwright/test')

const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const DRAFT = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=false)`

const pathOf = page => page.url().replace(/^https?:\/\/[^/]+/, '')
const title = page => page.locator('h1').first()
const confirmDialog = page => page.locator('.hf-message-box')

test.describe('@readonly entity (Genres)', () => {
  test('offers neither Create nor Delete nor selection, and refuses direct requests without crashing', async ({ page, request }) => {
    await page.goto('/htmx/catalog/Genres')
    await expect(page.getByRole('button', { name: 'Create' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expect(page.locator('.hf-checkbox')).toHaveCount(0)
    const res = await request.post('/htmx/catalog/Genres', { headers: { 'HX-Request': 'true' } })
    expect(res.status()).toBe(405)
    expect((await request.get('/htmx/catalog/Genres')).status()).toBe(200) // the server is still up
  })
})

test.describe('non-draft entity (Authors) is edited directly', () => {
  test('create, edit, cancel, save and delete without a draft or htmx-specific URLs', async ({ page }) => {
    await page.goto('/htmx/catalog/Authors')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(title(page)).toHaveText('New Author')
    expect(pathOf(page)).toBe('/htmx/catalog/Authors')

    await page.locator('input[name=name]').fill('E2E Author')
    await page.getByRole('button', { name: 'Create' }).last().click()
    await expect(title(page)).toHaveText('E2E Author')
    await expect(page.locator('#toast')).toContainText('Object created.')
    const objectUrl = pathOf(page)
    expect(objectUrl).toMatch(/^\/htmx\/catalog\/Authors\(ID='[0-9a-f-]{36}'\)$/)

    await page.getByRole('button', { name: 'Edit' }).click()
    expect(pathOf(page)).toBe(objectUrl) // edit mode is not a URL
    await page.locator('input[name=name]').fill('E2E Author Renamed')
    expect(pathOf(page)).toBe(objectUrl)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(title(page)).toHaveText('E2E Author')

    await page.getByRole('button', { name: 'Edit' }).click()
    await page.locator('input[name=name]').fill('E2E Author Renamed')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(title(page)).toHaveText('E2E Author Renamed')

    await page.locator('#op-page').getByRole('button', { name: 'Delete' }).click()
    await expect(confirmDialog(page)).toBeVisible() // a UI dialog, not window.confirm
    await confirmDialog(page).locator('[data-hf-cancel]').click()
    await expect(confirmDialog(page)).toHaveCount(0)
    expect(pathOf(page)).toBe(objectUrl)
    await page.locator('#op-page').getByRole('button', { name: 'Delete' }).click()
    await confirmDialog(page).locator('[data-hf-ok]').click()
    await expect(page).toHaveURL(/\/htmx\/catalog\/Authors$/)
    await expect(page.locator('body')).not.toContainText('E2E Author Renamed')
  })

  test('List Report Delete works on the ticked rows after a confirmation', async ({ page, request }) => {
    for (const name of ['E2E Bulk A', 'E2E Bulk B']) await request.post('/odata/v4/catalog/Authors', { data: { name } })
    await page.goto('/htmx/catalog/Authors')
    const remove = page.getByRole('button', { name: 'Delete' })
    await expect(remove).toBeDisabled()
    await page.locator('tr', { hasText: 'E2E Bulk A' }).locator('.hf-checkbox').check()
    await page.locator('tr', { hasText: 'E2E Bulk B' }).locator('.hf-checkbox').check()
    await expect(remove).toBeEnabled()
    await remove.click()
    await expect(confirmDialog(page)).toContainText('2')
    await confirmDialog(page).locator('[data-hf-ok]').click()
    await expect(page.locator('body')).not.toContainText('E2E Bulk')
  })
})

test.describe('draft flow and history (Books)', () => {
  test.afterEach(async ({ request }) => { await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {}) })

  test('typing keeps the URL clean and the header follows the draft; the draft marker switches versions', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.getByText('Jane Eyre').first().click()
    await expect(page).toHaveURL(/IsActiveEntity=true/)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(page).toHaveURL(/IsActiveEntity=false/)

    const input = page.locator('[data-hf-field=title] input[name=title]')
    await input.click()
    await input.press('End')
    await input.pressSequentially(' XX')
    await input.blur()
    await expect(title(page)).toHaveText('Jane Eyre XX')
    expect(pathOf(page)).toBe(DRAFT) // no /$field/title
    await expect(input).toHaveValue('Jane Eyre XX')

    await page.locator('[data-hf-popover-toggle]').click()
    await expect(page.locator('.hf-popover.is-open .hf-popover__item')).toHaveCount(2)
    await page.getByRole('button', { name: 'Saved Version' }).click()
    await expect(page).toHaveURL(new RegExp('IsActiveEntity=true'))
    await expect(title(page)).toHaveText('Jane Eyre')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0) // a draft exists
    await expect(page.locator('[data-hf-popover-toggle]')).toContainText('Saved Version')

    await page.locator('[data-hf-popover-toggle]').click()
    await page.getByRole('button', { name: 'Draft', exact: true }).click()
    await expect(page).toHaveURL(/IsActiveEntity=false/)

    // Edit and the version switches replaced the entry: Back goes to the list (like FE), Forward to where we were
    await page.goBack()
    await expect(page).toHaveURL(/\/htmx\/catalog\/Books$/)
    await page.goForward()
    await expect(page).toHaveURL(/IsActiveEntity=false/)
    await expect(title(page)).toHaveText('Jane Eyre XX')

    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(confirmDialog(page)).toBeVisible()
    await confirmDialog(page).locator('[data-hf-ok]').click()
    await expect(page).toHaveURL(/IsActiveEntity=true/)
    await page.goBack() // discarding replaced the draft's entry too: no dead draft URL is left in the history
    await expect(page).toHaveURL(/\/htmx\/catalog\/Books$/)
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
  })

  test('the List Report filter state survives opening an object and going back', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('input[name="$search"]').fill('Raven')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page).toHaveURL(/search=Raven/)
    await page.getByText('The Raven').first().click()
    await expect(page).toHaveURL(/IsActiveEntity=true/)
    await page.goBack()
    await expect(page.locator('body')).toContainText('The Raven')
    await expect(page.locator('body')).not.toContainText('Jane Eyre')
  })
})

test.describe('SSE side effects in the browser', () => {
  const EL = '3d2d2d2d-1c1c-4b4b-8a8a-000000000004' // Eleonora, stock 3
  const status = p => p.locator('.hf-field', { hasText: 'Status' }).first()

  test.afterEach(async ({ request }) => {
    await request.delete(`/odata/v4/catalog/Books(ID=${EL},IsActiveEntity=false)`).catch(() => {})
  })

  test('a pushed event updates an open object and a List Report row; editing a source field updates its status', async ({ browser, request }) => {
    const open = async url => { const page = await (await browser.newContext()).newPage(); await page.goto(url); return page }
    const viewer = await open(`/htmx/catalog/Books(ID='${EL}',IsActiveEntity=true)`)
    const list = await open('/htmx/catalog/Books')
    const playground = await open('/htmx/catalog/$playground')
    await expect(status(viewer)).toContainText('Low Stock')

    // the playground lists both pages (also the ones opened directly, not via an htmx request)
    await expect(playground.locator('#playground-clients')).toContainText(`Books(ID='${EL}'`, { timeout: 10000 })
    await expect(playground.locator('#playground-clients')).toContainText('List Report Books')

    const form = playground.locator('form.hf-playground__action', { hasText: 'simulateDelivery' })
    await form.locator('input[name=book]').fill(EL)
    await form.locator('input[name=qty]').fill('20')
    await form.getByRole('button', { name: 'Run' }).click()
    await expect(status(viewer)).toContainText('In Stock')
    await expect(list.locator(`#lr-row--${EL}-true`)).toContainText('In Stock')
    await expect(playground.locator('#playground-log')).toContainText('hx-partial')

    // editing: Stock -> Status through the Common.SideEffects of the annotations
    const editor = await open(`/htmx/catalog/Books(ID='${EL}',IsActiveEntity=true)`)
    await editor.getByRole('button', { name: 'Edit', exact: true }).click()
    await editor.locator('input[name=stock]').fill('0')
    await editor.locator('input[name=stock]').blur()
    await expect(status(editor)).toContainText('Out of Stock')

    await request.post('/odata/v4/catalog/simulateDelivery', { data: { book: EL, qty: -20 } })
  })
})
