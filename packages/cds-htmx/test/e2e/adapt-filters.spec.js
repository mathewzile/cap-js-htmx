const { test, expect } = require('@playwright/test')

// Adapt Filters shows the filter fields themselves, as FE's does, the Editing Status of a draft list included
test.describe('adapt filters', () => {
  const rows = page => page.locator('.hf-adapt__row')

  test('one row per filter field, Editing Status first; a value set there reaches the filter', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await expect(rows(page).locator('.hf-adapt__label')).toHaveText(['Editing Status:', 'Author:', 'Genre:', 'Status:'])
    await rows(page).first().locator('select').selectOption('OWN_DRAFT')
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[name="f.EditingStatus"]')).toHaveValue('OWN_DRAFT')
  })

  test('the eye hides a field, and a hidden field does not filter', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await rows(page).filter({ hasText: 'Editing Status' }).locator('.hf-adapt__eye').click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[data-hf-filter=EditingStatus]')).toBeHidden()
    await expect(page.locator('[name="f.EditingStatus"]')).toBeDisabled()
  })

  test('Filter applies what was entered and closes the dialog', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await rows(page).filter({ hasText: 'Status:' }).filter({ hasNotText: 'Editing' }).locator('input').first().fill('*Low*')
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await expect(page.locator('.hf-overlay')).toHaveCount(0)
    await expect(page.locator('[name="f.stockStatus"]')).toHaveValue('*Low*')
    const stati = await page.locator('#lr-table-body tr .fd-object-status__text').allTextContents()
    await expect.poll(async () => (await page.locator('#lr-table-body tr').count()) > 0).toBe(true)
    expect(stati.filter(text => text.trim() && !/Low Stock|\d/.test(text))).toEqual([])
  })
})
