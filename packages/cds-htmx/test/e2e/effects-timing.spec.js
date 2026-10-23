const { test, expect } = require('@playwright/test')

const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre, stock 5 (Low Stock)

test.afterEach(async ({ request }) => {
  await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {})
})

test('side effects of a change run when the focus leaves the field group, not on every change', async ({ page }) => {
  await page.goto(`/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const stock = page.locator('input[name=stock]')
  await expect(stock).toBeVisible()
  const group = page.locator('.hf-form[data-hf-fieldgroup]', { has: stock })
  const status = page.locator('.hf-field', { hasText: 'Status' }).first()
  await expect(status).toContainText('Low Stock')

  // change the stock and move to another field of the same group: the change is saved, its side effect (Status) waits
  await stock.fill('0')
  const neighbour = group.locator('input:not([name=stock]):not([type=hidden]), select, textarea').first()
  await neighbour.click()
  await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
  await page.waitForTimeout(1200)
  await expect(status).toContainText('Low Stock')

  // leaving the group runs it
  await page.locator('.hf-op-title__heading').click()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await expect(status).toContainText('Out of Stock')
})
