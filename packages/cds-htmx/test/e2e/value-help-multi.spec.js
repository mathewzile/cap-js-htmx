const { test, expect } = require('@playwright/test')

// The value help of a filter field selects several values, like FE's: ticked rows are listed under the table, OK puts them in the filter
test.describe('filter value help with several values', () => {
  test('two authors: the selection is shown, OK fills the filter, Go lists only their books', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('[data-hf-filter=author_ID] .hf-vh-open').click()
    const dialog = page.locator('.hf-dialog[data-hf-multi]')
    await expect(dialog.locator('.hf-vh-row')).toHaveCount(4)
    await expect(dialog.locator('.hf-vh__selection-title')).toHaveText('No Items or Conditions Selected')

    await dialog.locator('.hf-vh-row', { hasText: 'Poe' }).click()
    await dialog.locator('.hf-vh-row', { hasText: 'Carpenter' }).click()
    await expect(dialog.locator('.hf-vh__token')).toHaveText(['Edgar Allan Poe', 'Richard Carpenter'])
    await expect(dialog.locator('.hf-vh__selection-title')).toHaveText('Selected Items (2)')
    await dialog.locator('.hf-vh__token', { hasText: 'Carpenter' }).locator('button').click() // a token's x unselects it
    await expect(dialog.locator('.hf-vh__token')).toHaveCount(1)
    await dialog.locator('.hf-vh-row', { hasText: 'Carpenter' }).click()

    await dialog.locator('[data-hf-vh-ok]').click()
    await expect(page.locator('.hf-overlay')).toHaveCount(0)
    await expect(page.locator('[name="f.author_ID"]')).toHaveValue(/0003;.*0004$/)
    await page.getByRole('button', { name: 'Go' }).click()
    const authors = new Set(await page.locator('#lr-table-body td.hf-col-3').allTextContents())
    expect([...authors].sort()).toEqual(['Edgar Allan Poe', 'Richard Carpenter'])
  })

  test('reopening shows what the filter holds; Cancel keeps it', async ({ page }) => {
    await page.goto('/htmx/catalog/Books?f.author_ID=9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003')
    await page.locator('[data-hf-filter=author_ID] .hf-vh-open').click()
    const dialog = page.locator('.hf-dialog[data-hf-multi]')
    await expect(dialog.locator('.hf-vh__token')).toHaveCount(1)
    await expect(dialog.locator('.hf-vh-row', { hasText: 'Poe' }).locator('.hf-checkbox')).toBeChecked()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('[name="f.author_ID"]')).toHaveValue(/0003$/)
  })
})
