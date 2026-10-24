const { test, expect } = require('@playwright/test')

// In a draft the price is edited together with its currency, like FE's: the currency box inside the Price field and the separate
// Currency field hold the same property, so a change in one has to show in the other
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`

const priceField = page => page.locator('[data-hf-field=price]')
const unitInPrice = page => priceField(page).locator('input[name=currency_code]')
const amount = page => priceField(page).locator('input[name=price]')
const currencyField = page => page.locator('[data-hf-field=currency_code] input[name=currency_code]')

test.describe('price with its currency (draft)', () => {
  test.afterEach(async ({ request }) => { await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {}) })

  const draftValue = async (request, property) => (await (await request.get(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)?$select=${property}`)).json())[property]

  test('the Price field has the amount and a currency box; the Currency field and the box follow each other', async ({ page, request }) => {
    await page.goto(ACTIVE)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(amount(page)).toHaveValue('9.99')
    await expect(unitInPrice(page)).toHaveValue('EUR')
    await expect(currencyField(page)).toHaveValue('EUR')
    await expect(amount(page)).toHaveClass(/hf-input--end/) // numbers are right-aligned

    // the Currency field changes: the box in Price shows it
    await currencyField(page).fill('USD')
    await currencyField(page).press('Tab')
    await expect(unitInPrice(page)).toHaveValue('USD')
    expect(await draftValue(request, 'currency_code')).toBe('USD')

    // the box in Price changes: the Currency field shows it, and the box keeps what was typed
    await unitInPrice(page).fill('GBP')
    await unitInPrice(page).press('Tab')
    await expect(currencyField(page)).toHaveValue('GBP')
    await expect(unitInPrice(page)).toHaveValue('GBP')
    expect(await draftValue(request, 'currency_code')).toBe('GBP')

    // and back through the Currency field once more
    await currencyField(page).fill('EUR')
    await currencyField(page).press('Tab')
    await expect(unitInPrice(page)).toHaveValue('EUR')

    // the amount is its own property: changing it leaves the currency alone
    await amount(page).fill('12.5')
    await amount(page).press('Tab')
    await expect(amount(page)).toHaveValue('12.5')
    await expect(unitInPrice(page)).toHaveValue('EUR')
    await expect(currencyField(page)).toHaveValue('EUR')
    expect(Number(await draftValue(request, 'price'))).toBe(12.5)
    expect(await draftValue(request, 'currency_code')).toBe('EUR')
  })

  test('the currency box opens the value help of the currencies', async ({ page }) => {
    await page.goto(ACTIVE)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await priceField(page).locator('.hf-vh-open').click()
    const dialog = page.locator('.hf-dialog--value-help')
    await expect(dialog).toBeVisible()
    await dialog.locator('.hf-vh-row', { hasText: 'GBP' }).click()
    await expect(unitInPrice(page)).toHaveValue('GBP')
    await expect(currencyField(page)).toHaveValue('GBP')
  })

  test('a saved book shows the price as before: amount and currency as text', async ({ page }) => {
    await page.goto(ACTIVE)
    await expect(page.locator('[data-hf-field=price]')).toHaveCount(0)
    await expect(page.locator('body')).toContainText('9.99 EUR')
  })
})
