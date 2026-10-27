const { test, expect } = require('@playwright/test')

// Pressing Edit changes the inputs, not the layout: the title, the form fields and the table rows of an Object Page keep their place
// and size (a field is as tall as its value, a value as tall as the input that replaces it). Every field type belongs here.

const layout = page => page.evaluate(() => {
  const box = e => { const r = e.getBoundingClientRect(); return `${Math.round(r.top)}/${Math.round(r.height)}` }
  const all = selector => [...document.querySelectorAll(selector)].map(box)
  return { title: all('.hf-op-title'), anchor: all('.hf-anchor-bar'), fields: all('.hf-op-content .hf-field'), sections: all('.hf-section'), rows: all('.hf-section--table tbody tr') }
})

// the other specs share the data: a draft that is left behind is a row in their List Report
const discard = async page => {
  const button = page.getByRole('button', { name: 'Discard Draft' })
  if (await button.count()) await button.first().click()
}

for (const [name, open] of [
  ['a Book (amount with currency, text area, value helps, table sections)', async page => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('#lr-table-body > tr[id^=lr-row--]').first().click()
  }],
  ['an Author (draft with the draft indicator in the title)', async page => {
    await page.goto('/htmx/admin/Authors')
    await page.locator('#lr-table-body > tr[id^=lr-row--]').nth(3).click()
  }]
]) {
  test(`Edit does not move or resize anything on ${name}`, async ({ page }) => {
    await open(page)
    const edit = page.getByRole('button', { name: 'Edit', exact: true })
    await expect(edit).toBeVisible()
    await page.waitForTimeout(500)
    const before = await layout(page)
    expect(before.fields.length).toBeGreaterThan(2)
    await edit.click()
    await expect(page.locator('.hf-page--edit')).toBeVisible()
    await expect(page.locator('.hf-op-content input.fd-input').first()).toBeVisible()
    await page.waitForTimeout(500)
    expect(await layout(page)).toEqual(before)
    await discard(page)
  })
}

// A password manager's button (LastPass...) makes an input a few pixels taller or wider. The columns of a form are balanced by the height
// of their fields, so a field of exactly the same height as the others must not let that move another field into the next column.
test('an input that grows a little does not move fields to another column', async ({ page }) => {
  await page.goto('/htmx/admin/Authors')
  await page.locator('#lr-table-body > tr[id^=lr-row--]').nth(2).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.hf-op-content input.fd-input').first()).toBeVisible()
  await page.waitForTimeout(500)
  const lefts = () => page.evaluate(() => [...document.querySelectorAll('.hf-op-content .hf-field')].slice(0, 4).map(f => Math.round(f.getBoundingClientRect().left)))
  const before = await lefts()
  await page.locator('.hf-op-content input.fd-input').first().evaluate(input => { input.style.marginBottom = '3px'; input.style.paddingRight = '30px' })
  expect(await lefts()).toEqual(before)

  // ... and an element it puts next to the input (the button's container: no size) does not push the input around either
  const top = () => page.locator('.hf-op-content input.fd-input').first().evaluate(input => Math.round(input.getBoundingClientRect().top * 10) / 10)
  const inputTop = await top()
  const first = page.locator('.hf-op-content input.fd-input').first()
  await first.evaluate(input => {
    for (const place of ['afterend', 'beforebegin']) input.insertAdjacentHTML(place, '<span data-extension-root style="position: relative !important; height: 0px !important; width: 0px !important; float: left !important;"></span>')
  })
  expect(await top()).toBe(inputTop)
  await discard(page)
})
