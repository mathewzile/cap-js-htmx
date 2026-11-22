// Tree table editing in the local launchpad sandbox: Cut and Paste move a node, Create below a selected node.
const { test, expect } = require('@playwright/test')

const FLP = '/flp-htmx/flpSandbox.html'

test('Cut and Paste move a node below another one, Paste is off until something was cut', async ({ page }) => {
  test.setTimeout(240000)
  await page.goto(FLP + '#Categories-manageHtmx')
  const rows = page.locator('.hf-table tbody tr[data-hf-level]')
  await expect(rows.first()).toBeVisible({ timeout: 120000 })
  const row = name => page.locator('.hf-table tbody tr[data-hf-level]', { hasText: name }).first()
  const tick = name => row(name).locator('.hf-checkbox').check()
  const cut = page.locator('[data-hf-tree-cut]')
  const paste = page.locator('[data-hf-tree-paste]')

  await expect(cut).toBeDisabled()
  await expect(paste).toBeDisabled()
  await tick('Reference')
  await expect(cut).toBeEnabled()
  await cut.click()
  await expect(row('Reference')).toHaveClass(/hf-row--cut/)
  await expect(page.locator('#app tr .hf-checkbox:checked')).toHaveCount(0)
  await expect(paste).toBeEnabled() // nothing selected: to the top level
  await tick('Non-Fiction')
  await tick('Fiction')
  await expect(paste).toBeDisabled() // two selected
  await row('Fiction').locator('.hf-checkbox').uncheck()
  await expect(paste).toBeEnabled()
  await paste.click()
  // Reference is now a child of Non-Fiction (level 1), and the cut mark is gone
  await expect(row('Reference')).toHaveAttribute('data-hf-level', '1')
  await expect(page.locator('tr.hf-row--cut')).toHaveCount(0)
  await expect(paste).toBeDisabled()
})
