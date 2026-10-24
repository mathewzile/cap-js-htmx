const { test, expect } = require('@playwright/test')

// A date filter is FE's dynamic date range: one input with a calendar button and a list of choices (the Authors' date of birth)
const field = page => page.locator('[data-hf-filter=dateOfBirth]')
const popup = page => page.locator('.hf-datepop')
const rows = page => page.locator('#lr-table-body tr:not(.hf-table__nodata)')

test.describe('date filter', () => {
  test('is one input with a calendar button; the date inputs of the form stay out of sight', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    await expect(field(page).locator('.hf-date-range__text')).toBeVisible()
    await expect(field(page).getByRole('button', { name: 'Open Picker' })).toBeVisible()
    await expect(field(page).locator('input[type=date]').first()).toBeHidden()
  })

  test('lists what FE lists, and a choice such as This Year is a filter by name', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    await field(page).getByRole('button', { name: 'Open Picker' }).click()
    await expect(popup(page).locator('.hf-datepop__group')).toHaveText(['Single Dates', 'Date Ranges', 'Weeks', 'Months', 'Quarters', 'Years', 'No Date / Range'])
    await expect(popup(page).locator('.hf-datepop__item')).toHaveCount(30)
    await popup(page).getByText('This Year', { exact: true }).click()
    await expect(popup(page)).toHaveCount(0)
    await expect(field(page).locator('.hf-date-range__text')).toHaveValue('This Year')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.locator('#lr-table-body')).toContainText('No data') // nobody of the four was born this year
    await page.reload()
    await expect(field(page).locator('.hf-date-range__text')).toHaveValue('This Year') // the state is in the URL
  })

  test('Not Specified finds the empty dates', async ({ page, request }) => {
    const created = await (await request.post('/admin/Authors', { data: { name: 'E2E No Birthday' } })).json()
    await request.post(`/admin/Authors(ID=${created.ID},IsActiveEntity=false)/AdminService.draftActivate`, { data: {} }) // a POST makes a draft
    try {
      await page.goto('/htmx/admin/Authors')
      await field(page).locator('.hf-date-range__text').fill('Not Specified')
      await field(page).locator('.hf-date-range__text').press('Tab')
      await page.getByRole('button', { name: 'Go' }).click()
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page)).toContainText('E2E No Birthday')
    } finally {
      await request.delete(`/admin/Authors(ID=${created.ID},IsActiveEntity=false)`).catch(() => {})
      await request.delete(`/admin/Authors(ID=${created.ID},IsActiveEntity=true)`).catch(() => {})
    }
  })

  test('typing a range filters; the field shows it formatted', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    const text = field(page).locator('.hf-date-range__text')
    await text.fill('1810-01-01 – 1820-12-31')
    await text.press('Tab')
    await expect(text).toHaveValue('Jan 1, 1810 – Dec 31, 1820')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(rows(page)).toHaveCount(2) // Emily 1818, Charlotte 1816
  })

  test('the calendar of From / To takes two days; its month and year can be chosen', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    await field(page).getByRole('button', { name: 'Open Picker' }).click()
    await popup(page).locator('.hf-datepop__item', { hasText: 'From / To' }).click()
    await expect(popup(page).getByRole('button', { name: 'Apply' })).toBeDisabled()
    // 1816 and 1818: pick the year from the pages of years, then the month
    const goTo = async (year, monthName) => {
      await popup(page).locator('[data-mode=years]').click()
      for (let i = 0; i < 20 && !(await popup(page).locator(`[data-value="${year}"]`).count()); i++) {
        await popup(page).locator(`[data-page="${year < 2000 ? -1 : 1}"]`).click()
      }
      await popup(page).locator(`[data-value="${year}"]`).click()
      await popup(page).locator('[data-mode=months]').click()
      await popup(page).getByRole('button', { name: monthName, exact: true }).click()
    }
    await goTo(1816, 'April')
    await popup(page).locator('[data-day="1816-04-21"]').click()
    await goTo(1818, 'July')
    await popup(page).locator('[data-day="1818-07-30"]').click()
    await popup(page).getByRole('button', { name: 'Apply' }).click()
    await expect(field(page).locator('.hf-date-range__text')).toHaveValue('Apr 21, 1816 – Jul 30, 1818')
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(rows(page)).toHaveCount(2)
  })

  test('Last X: a number and a unit', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    await field(page).getByRole('button', { name: 'Open Picker' }).click()
    await popup(page).locator('.hf-datepop__item', { hasText: 'Last X' }).click()
    await popup(page).locator('input[type=number]').fill('3')
    await popup(page).locator('select').selectOption('month')
    await popup(page).getByRole('button', { name: 'Apply' }).click()
    await expect(field(page).locator('.hf-date-range__text')).toHaveValue('Last 3 Months')
    await expect(page.locator('[name="f.dateOfBirth"]')).toHaveValue('last 3 months')
  })
})
