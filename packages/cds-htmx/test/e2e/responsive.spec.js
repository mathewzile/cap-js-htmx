const { test, expect } = require('@playwright/test')

// The Flexible Column Layout follows the UI5 device ranges by the width of the layout: a phone shows one column (the deepest),
// a tablet at most two, a desktop all it has. Authors (list) -> an author -> one of the author's books makes three columns.
const AUTHORS = '/htmx/admin/Authors'
const widthOf = (page, col) => page.locator(`#fcl > section[data-hf-col="${col}"]`).evaluate(el => Math.round(el.getBoundingClientRect().width))

async function openThreeColumns(page) {
  await page.goto(AUTHORS)
  await page.locator('.hf-table tbody tr').first().click()
  await expect(page.locator('#fcl > section[data-hf-col="1"] .hf-page--op')).toBeVisible()
  await page.locator('#fcl > section[data-hf-col="1"] .hf-section--table tbody tr').first().click()
  await expect(page.locator('#fcl > section[data-hf-col="2"] .hf-page--op')).toBeVisible()
  await page.waitForTimeout(900) // the columns animate
}

test('a desktop shows all three columns', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 })
  await openThreeColumns(page)
  for (const col of [0, 1, 2]) expect(await widthOf(page, col)).toBeGreaterThan(100)
})

test('a tablet shows two columns: the first one makes room', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await openThreeColumns(page)
  expect(await widthOf(page, 0)).toBe(0)
  expect(await widthOf(page, 1)).toBeGreaterThan(100)
  expect(await widthOf(page, 2)).toBeGreaterThan(100)
})

test('a phone shows one column, the deepest, and Close leads back to the one before', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 })
  await openThreeColumns(page)
  expect(await widthOf(page, 0)).toBe(0)
  expect(await widthOf(page, 1)).toBe(0)
  expect(await widthOf(page, 2)).toBeGreaterThan(380)
  await page.locator('#fcl > section[data-hf-col="2"]').getByRole('button', { name: 'Close' }).first().click()
  await page.waitForTimeout(900)
  expect(await widthOf(page, 1)).toBeGreaterThan(380)
  expect(await widthOf(page, 2)).toBe(0)
})

test('a phone: the filter bar stacks (one filter per row)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 })
  await page.goto(AUTHORS)
  const filters = page.locator('.hf-filter')
  const first = await filters.first().evaluate(el => el.getBoundingClientRect().width)
  expect(first).toBeGreaterThan(300)
})
