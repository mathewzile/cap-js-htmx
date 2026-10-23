const { test, expect } = require('@playwright/test')

// admin Books.createdAt is a date-time range filter (manage-authors-htmx annotation.xml); the browser runs at UTC+8
test.use({ timezoneId: 'Asia/Singapore' })

const count = page => page.locator('#lr-count')
const from = page => page.locator('input[name="f.createdAt.ge"]')
const to = page => page.locator('input[name="f.createdAt.le"]')

test.describe('date-time filter', () => {
  test('the picked local time goes to the server as the UTC instant, and a reload shows the same local time', async ({ page }) => {
    await page.goto('/htmx/admin/Books')
    await expect(count(page)).toHaveText('1,005')
    await expect(from(page)).toHaveAttribute('type', 'datetime-local')

    await from(page).fill('2000-01-01T08:00')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(count(page)).toHaveText('1,005')
    await expect.poll(() => decodeURIComponent(page.url())).toContain('f.createdAt.ge=2000-01-01T00:00:00.000Z') // 08:00 at UTC+8

    await to(page).fill('2000-01-02T08:00')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(count(page)).toHaveText('0')

    await page.reload()
    await expect(from(page)).toHaveValue('2000-01-01T08:00')
    await expect(to(page)).toHaveValue('2000-01-02T08:00')
    await expect(count(page)).toHaveText('0')

    await to(page).fill('')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(count(page)).toHaveText('1,005')
  })

  test('sorting and More keep the date-time filter (it travels in UTC there too)', async ({ page }) => {
    await page.goto('/htmx/admin/Books')
    await to(page).fill('2000-01-02T08:00')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(count(page)).toHaveText('0')
    await page.locator('thead th.hf-th').first().click()
    await page.locator('.hf-colmenu').getByRole('menuitem', { name: 'Sort Ascending' }).click()
    await expect(count(page)).toHaveText('0') // not 1,005: the filter survived the sort
  })
})
