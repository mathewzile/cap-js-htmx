const { test, expect } = require('@playwright/test')

// A Common.SemanticObject link opens a popover of the launchpad's targets and follows the one that is picked. The page script is
// driven here with an adapter of its own (the bookshop has no such property): the plugin's side is the render tests.
test('the link asks the adapter for the targets, lists them, and follows the one picked', async ({ page }) => {
  await page.goto('/htmx/admin/Authors')
  await expect(page.locator('.hf-table tbody tr').first()).toBeVisible()
  await page.evaluate(() => {
    window.calls = []
    window.HtmxShell = { adapter: {
      getLinks: async args => { window.calls.push(['getLinks', args]); return [{ intent: '#Authors-display', text: 'Display Author' }, { intent: '#Authors-manage', text: 'Manage Authors' }] },
      navigateTo: async intent => { window.calls.push(['navigateTo', intent]) }
    } }
    const link = document.createElement('a')
    link.href = '#'; link.id = 'semlink'; link.textContent = 'Emily'
    Object.assign(link.dataset, { hfSemanticObject: 'Authors', hfSemanticParam: 'name', hfSemanticValue: 'Emily' })
    document.querySelector('.hf-table tbody tr td').append(link)
  })
  await page.locator('#semlink').click()
  const popover = page.locator('.hf-semantic-popover')
  await expect(popover.getByRole('menuitem')).toHaveCount(2)
  expect(await page.evaluate(() => window.calls[0])).toEqual(['getLinks', { semanticObject: 'Authors', params: { name: 'Emily' } }])
  await expect(page).toHaveURL(/\/htmx\/admin\/Authors$/) // the click did not open the row
  await popover.getByRole('menuitem', { name: 'Manage Authors' }).click()
  expect(await page.evaluate(() => window.calls[1])).toEqual(['navigateTo', '#Authors-manage'])
  await expect(popover).toHaveCount(0)
})

test('without a launchpad the popover says there are no targets', async ({ page }) => {
  await page.goto('/htmx/admin/Authors')
  await expect(page.locator('.hf-table tbody tr').first()).toBeVisible()
  await page.evaluate(() => {
    window.HtmxShell = { adapter: {} }
    const link = document.createElement('a')
    link.href = '#'; link.id = 'semlink'; link.textContent = 'Emily'
    Object.assign(link.dataset, { hfSemanticObject: 'Authors', hfSemanticParam: 'name', hfSemanticValue: 'Emily' })
    document.querySelector('.hf-table tbody tr td').append(link)
  })
  await page.locator('#semlink').click()
  await expect(page.locator('.hf-semantic-popover')).toContainText('No navigation targets')
})
