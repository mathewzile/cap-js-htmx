const { test, expect } = require('@playwright/test')

// What FE does (checked on the FE app): an untouched draft is discarded at once with a "Draft discarded" toast, a changed one is asked
// about in a small popover over the button, and a Save that fails opens the message popover by itself
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const title = page => page.locator('[data-hf-field=title] input[name=title]')
const popover = page => page.locator('.hf-confirm-popover')
const edit = async page => { await page.goto(ACTIVE); await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expect(title(page)).toBeVisible() }

test.describe('discarding a draft and a failed save', () => {
  test.afterEach(async ({ request }) => { await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {}) })

  test('an untouched draft is discarded without a question', async ({ page }) => {
    await edit(page)
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(page.locator('#toast')).toContainText('Draft discarded')
    await expect(page.getByRole('button', { name: 'Edit', exact: true }).first()).toBeVisible()
    await expect(popover(page)).toHaveCount(0)
    await expect(page.locator('.hf-message-box')).toHaveCount(0)
  })

  test('a changed draft is asked about in a popover; Escape keeps it, Discard drops it', async ({ page }) => {
    await edit(page)
    await title(page).fill('Jane Eyre changed')
    await title(page).press('Tab')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(popover(page)).toContainText('Discard all changes?')
    await expect(page.locator('.hf-message-box')).toHaveCount(0) // a popover, not a message box
    await page.keyboard.press('Escape')
    await expect(popover(page)).toHaveCount(0)
    await expect(title(page)).toHaveValue('Jane Eyre changed') // kept

    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await popover(page).getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(page.locator('#toast')).toContainText('Draft discarded')
    await expect(page.locator('h1').first()).toHaveText('Jane Eyre')
  })

  test('a draft that is opened again after it was changed is asked about, even after a reload', async ({ page }) => {
    await edit(page)
    await title(page).fill('Jane Eyre again')
    await title(page).press('Tab')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await page.reload()
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(popover(page)).toBeVisible()
  })

  test('a Save that fails shows its messages without a click', async ({ page }) => {
    await edit(page)
    await title(page).fill('')
    await title(page).press('Tab')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.hf-footer__messages .hf-popover.is-open .hf-msg-popover')).toBeVisible()
    await expect(page.locator('.hf-msg-popover')).toContainText('Title')
  })
})
