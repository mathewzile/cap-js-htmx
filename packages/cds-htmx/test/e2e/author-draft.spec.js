const { test, expect } = require('@playwright/test')

// manage-authors-htmx (the Work Zone app) against manage-authors (the FE app): edit on the Author page, then navigate to an Award and
// its General section shows editable fields. Authors is a draft root, Awards its composition, Books a non-draft association.
const SHELL = '/manage-authors-htmx/webapp/index.html'
const POE = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003' // two awards
const col = (page, n) => page.locator(`#fcl-col-${n}`)

test.afterEach(async ({ request }) => {
  await request.delete(`/admin/Authors(ID=${POE},IsActiveEntity=false)`).catch(() => {})
})

async function openAuthor(page) {
  await page.goto(SHELL)
  await page.locator('#lr-table-body tr', { hasText: 'Edgar Allan Poe' }).click()
  await expect(page.locator('#op-page')).toBeVisible()
}

test.describe('Author draft with Awards in the column layout', () => {
  test('Edit makes the Author page editable, an Award opens with editable General fields and Apply', async ({ page }) => {
    await openAuthor(page)
    await expect(col(page, 1).getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await col(page, 1).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 1).locator('#op-section--GeneratedFacet1 input[name=name]')).toBeVisible() // General Information
    await expect(col(page, 1).getByRole('button', { name: 'Save' })).toBeVisible()
    await expect(col(page, 1).getByRole('button', { name: 'Discard Draft' })).toBeVisible()

    // the Awards table is editable (a composition: Create, Delete, paste); Books are edited in place and deleted from, not created in
    const awards = col(page, 1).locator('#op-section--Awards')
    await expect(awards.locator('tbody tr')).toHaveCount(2)
    await expect(awards.getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(col(page, 1).locator('#op-section--Books').getByRole('button', { name: 'Create' })).toHaveCount(0)

    // navigate to an Award: a third column with the draft of that Award
    await awards.locator('tbody tr').first().locator('.hf-col-nav').click()
    await expect(page.locator('#c2-op-page')).toBeVisible()
    await expect(col(page, 2).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 2).locator('#c2-op-section--General input[name=name]')).toBeVisible()
    await expect(col(page, 2).locator('#c2-op-section--General input[name=year]')).toBeVisible()
    await expect(col(page, 2).getByRole('button', { name: 'Apply' })).toBeVisible()
    for (const name of ['Edit', 'Delete', 'Save']) await expect(col(page, 2).getByRole('button', { name, exact: true })).toHaveCount(0)
    await expect(col(page, 2).locator('.hf-op-title__actions').getByRole('button')).toHaveCount(0) // no Delete in the header of a page reached through a navigation
    expect(decodeURIComponent(new URL(page.url()).hash)).toMatch(/Authors\(ID='[^']+',IsActiveEntity=false\)\/awards\(ID='[^']+',IsActiveEntity=false\)$/)

    // the footer of a page that is shorter than its column is at the bottom of the column, not at the end of the page
    const [box, footer] = [await col(page, 2).boundingBox(), await col(page, 2).locator('.hf-footer').boundingBox()]
    expect(box.y + box.height - (footer.y + footer.height)).toBeLessThan(24)
    expect(footer.y).toBeGreaterThan(box.y + box.height / 2)

    // an edit in the third column goes into the one draft; Apply closes the column, the first page is still being edited
    await col(page, 2).locator('input[name=year]').fill('1950')
    await col(page, 2).locator('input[name=year]').blur()
    await expect(page.locator('#c2-op-draft-status')).toContainText('Draft saved')
    await col(page, 2).getByRole('button', { name: 'Apply' }).click()
    await expect(col(page, 2).locator('.hf-page')).toHaveCount(0)
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    await expect(awards.locator('tbody tr').first().locator('input[name*=year]')).toHaveValue(/1,?950/)
  })

  test('with an Award open, Edit on the first page switches it to the draft; Discard Draft brings the saved Award back', async ({ page }) => {
    await openAuthor(page)
    await col(page, 1).locator('#op-section--Awards tbody tr[hx-get]').first().click()
    await expect(page.locator('#c2-op-page')).toBeVisible()
    await expect(col(page, 2).locator('input[name=year]')).toHaveCount(0) // saved version: no inputs
    await expect(col(page, 2).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0) // the sub-object page has no Edit, as in FE

    await col(page, 1).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(col(page, 2).locator('input[name=year]')).toBeVisible()
    await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toMatch(/IsActiveEntity=false\)\/awards\(ID='[^']+',IsActiveEntity=false\)$/)

    await col(page, 1).getByRole('button', { name: 'Discard Draft' }).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toHaveCount(0)
    await expect(col(page, 2).locator('input[name=year]')).toHaveCount(0)
    await expect(col(page, 2).locator('#c2-op-page')).toBeVisible()
  })
})
