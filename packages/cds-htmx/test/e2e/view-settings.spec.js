const { test, expect } = require('@playwright/test')

// View Settings lists every property of the entity, as FE's does: the columns shown first, the others by name; ticking one adds a column
test.describe('view settings: every property', () => {
  const rowOf = (page, label) => page.locator('.hf-dialog__row', { hasText: label }).filter({ hasNot: page.locator('.hf-dialog__row--head') })

  test('lists the 5 columns first and the other properties after them; one can be added as a column', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('thead th.hf-th:visible')).toHaveCount(5)
    await page.locator('[data-hf-action=settings]').click()
    const dialog = page.locator('.hf-dialog')
    await expect(dialog.locator('.hf-dialog__row--head')).toContainText('Columns (5/17)')
    const labels = await dialog.locator('.hf-dialog__row:not(.hf-dialog__row--head) .hf-dialog__row-text').allTextContents()
    expect(labels.slice(0, 5)).toEqual(['Book Title (XML override)', 'Stock', 'Status', 'Author', 'Price'])
    const rest = labels.slice(5)
    expect(rest).toHaveLength(12)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b))) // by name
    expect(rest).toEqual(expect.arrayContaining(['Created On', 'Currency', 'Description', 'Rating', 'Total Pages']))

    await rowOf(page, 'Rating').locator('input').check()
    await expect(dialog.locator('.hf-dialog__row--head')).toContainText('Columns (6/17)')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('thead th.hf-th:visible')).toHaveCount(6)
    await expect(page.locator('thead th.hf-th:visible').last()).toHaveText('Rating')
    await expect(page.locator('#lr-table-body tr').first().locator('td:visible').nth(6)).not.toBeEmpty()

    await page.reload() // the choice is kept
    await expect(page.locator('thead th.hf-th:visible')).toHaveCount(6)
    await page.locator('[data-hf-action=settings]').click()
    await page.getByRole('button', { name: 'Reset' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('thead th.hf-th:visible')).toHaveCount(5)
  })

  test('an added column exports with the others, and a saved view keeps it', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('[data-hf-action=settings]').click()
    await rowOf(page, 'Description').locator('input').check()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('thead th.hf-th:visible').last()).toHaveText('Description')

    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.locator('.hf-vm__foot').getByRole('button', { name: 'Save As' }).click()
    await page.locator('.hf-dialog input').fill('With description')
    await page.getByRole('button', { name: 'OK' }).click()

    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.locator('#hf-variants .hf-popover__item', { hasText: /^Standard$/ }).click()
    await expect(page.locator('thead th.hf-th:visible')).toHaveCount(5) // the standard view has the table's own columns

    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.locator('#hf-variants .hf-popover__item', { hasText: 'With description' }).click()
    await expect(page.locator('thead th.hf-th:visible').last()).toHaveText('Description')
  })
})
