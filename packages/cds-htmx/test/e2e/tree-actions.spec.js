// Tree table actions of Fiori elements in the htmx Manage Categories app: expand / collapse the entire tree and a node, the row context menu,
// Move Up / Move Down and drag and drop (between siblings, onto a node, onto the empty area), which order the nodes through the
// ChangeNextSiblingAction of Hierarchy.RecursiveHierarchyActions.
const { test, expect } = require('@playwright/test')

const FLP = '/flp-htmx/flpSandbox.html'
test.describe.configure({ mode: 'serial' })

const row = (page, name) => page.locator('.hf-table tbody tr[data-hf-level]', { hasText: name }).first()
const level = async (page, name) => Number(await row(page, name).getAttribute('data-hf-level'))
/** the names of the visible rows, in order */
const names = async page => (await page.locator('.hf-table tbody tr[data-hf-level]:visible td.hf-col-0').allInnerTexts()).map(t => t.trim())

test.beforeEach(async ({ page }) => {
  test.setTimeout(240000)
  await page.goto(FLP + '#Categories-manageHtmx')
  await expect(page.locator('.hf-table tbody tr[data-hf-level]').first()).toBeVisible({ timeout: 120000 })
})

test('Expand / Collapse Entire Tree open and close every level; the context menu does it for one node', async ({ page }) => {
  await page.locator('[data-hf-tree-expand-all]').click()
  await expect(row(page, 'Cozy Mystery')).toBeVisible() // three levels down
  await page.locator('[data-hf-tree-collapse-all]').click()
  await expect(row(page, 'Drama')).toBeHidden()
  await expect(row(page, 'Fiction')).toBeVisible()
  // right click on a row: the node's own entries (a leaf has them off)
  await row(page, 'Fiction').locator('td.hf-col-0').click({ button: 'right' })
  const menu = page.locator('.hf-colmenu')
  await expect(menu.getByRole('menuitem', { name: 'Expand Entire Node' })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: 'Open in New Tab or Window' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeEnabled() // the row was selected by the right click
  await menu.getByRole('menuitem', { name: 'Expand Entire Node' }).click()
  await expect(row(page, 'Cozy Mystery')).toBeVisible()
  await row(page, 'Fiction').locator('td.hf-col-0').click({ button: 'right' })
  await page.locator('.hf-colmenu').getByRole('menuitem', { name: 'Collapse Entire Node' }).click()
  await expect(row(page, 'Mystery')).toBeHidden()
})

test('Move Up / Move Down put a node before or after its sibling', async ({ page }) => {
  await page.locator('[data-hf-tree-expand-all]').click()
  await expect(row(page, 'Cozy Mystery')).toBeVisible()
  const up = page.locator('[data-hf-tree-sibling="up"]')
  const down = page.locator('[data-hf-tree-sibling="down"]')
  await expect(up).toBeDisabled()
  await row(page, 'Drama').locator('.hf-checkbox').check()
  await expect(up).toBeDisabled() // the first of Fiction's nodes
  await expect(down).toBeEnabled()
  const before = await names(page)
  expect(before.indexOf('Drama')).toBeLessThan(before.indexOf('Mystery'))
  await down.click()
  await expect(async () => {
    const after = await names(page)
    expect(after.indexOf('Mystery')).toBeLessThan(after.indexOf('Drama'))
  }).toPass()
  // and back
  await row(page, 'Drama').locator('.hf-checkbox').check()
  await expect(down).toBeDisabled() // now the last one
  await up.click()
  await expect(async () => {
    const again = await names(page)
    expect(again.indexOf('Drama')).toBeLessThan(again.indexOf('Mystery'))
  }).toPass()
})

test('dropping a node on the edge of a sibling orders it there; on a node it becomes its child; on the empty area a top-level node', async ({ page }) => {
  await page.locator('[data-hf-tree-expand-all]').click()
  await expect(row(page, 'Cozy Mystery')).toBeVisible()
  await expect(row(page, 'Drama')).toHaveAttribute('draggable', 'true')
  // Mystery onto the upper edge of Drama: before it, below the same parent
  await row(page, 'Mystery').dragTo(row(page, 'Drama'), { sourcePosition: { x: 80, y: 8 }, targetPosition: { x: 80, y: 2 } })
  await expect(async () => {
    const after = await names(page)
    expect(after.indexOf('Mystery')).toBeLessThan(after.indexOf('Drama'))
  }).toPass()
  expect(await level(page, 'Mystery')).toBe(await level(page, 'Drama'))
  // Drama onto the middle of Mystery: below it
  await page.locator('[data-hf-tree-expand-all]').click()
  await row(page, 'Drama').dragTo(row(page, 'Mystery'), { sourcePosition: { x: 80, y: 8 } })
  await expect(async () => expect(await level(page, 'Drama')).toBe((await level(page, 'Mystery')) + 1)).toPass()
  // Drama onto the empty area (the toolbar above the table): the top level
  await page.locator('[data-hf-tree-expand-all]').click()
  await row(page, 'Drama').dragTo(page.locator('.hf-table-toolbar'), { sourcePosition: { x: 80, y: 8 } })
  await expect(async () => expect(await level(page, 'Drama')).toBe(0)).toPass()
  // a node cannot be dropped on its own node: nothing happens
  await page.locator('[data-hf-tree-expand-all]').click()
  const cozyBefore = await level(page, 'Cozy Mystery')
  await row(page, 'Mystery').dragTo(row(page, 'Cozy Mystery'), { sourcePosition: { x: 80, y: 8 } })
  expect(await level(page, 'Cozy Mystery')).toBe(cozyBefore)
})
