const { test, expect } = require('@playwright/test')

// The test app fixture.fclbooks (test/fixtures/apps/fcl-books) runs Books | Book | Chapter in columns; Books is a draft root with
// chapters as a draft composition. The shell page of manage-books-htmx is started with that app's manifest instead of its own.
const fs = require('node:fs')
const path = require('node:path')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'apps', 'fcl-books', 'webapp', 'manifest.json'), 'utf8'))
const SHELL = '/manage-books-htmx/webapp/index.html'
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre, three chapters

const col = (page, n) => page.locator(`#fcl-col-${n}`)
const editButton = (page, n) => col(page, n).getByRole('button', { name: 'Edit', exact: true })
const hash = page => decodeURIComponent(new URL(page.url()).hash)

test.beforeEach(async ({ page }) => {
  await page.route('**/manage-books-htmx/webapp/manifest.json', route => route.fulfill({ json: MANIFEST }))
})

test.afterEach(async ({ request }) => {
  // every draft of the run, also the ones a Create left behind when its test failed (they would count in the list)
  const drafts = await request.get('/odata/v4/catalog/Books?$filter=IsActiveEntity eq false&$select=ID').then(r => r.json()).catch(() => ({}))
  for (const d of drafts.value || []) await request.delete(`/odata/v4/catalog/Books(ID=${d.ID},IsActiveEntity=false)`).catch(() => {})
})

async function openChapter(page) {
  await page.goto(SHELL)
  await page.locator('#lr-table-body tr', { hasText: 'Jane Eyre' }).click()
  await expect(page.locator('#op-page')).toBeVisible()
  await page.locator('#op-section--Chapters tbody tr[hx-get]').first().click()
  await expect(page.locator('#c2-op-page')).toBeVisible()
}

test.describe('the List Report in the first column follows the drafts', () => {
  const draftRows = page => col(page, 0).locator('tr[hx-get*="IsActiveEntity=false"]')
  const total = async page => Number((await col(page, 0).locator('.hf-table-toolbar__title').textContent()).match(/\(([\d,]+)\)/)[1].replace(/,/g, ''))

  test('a new draft is a row of the list at once, Discard removes it again, without a reload', async ({ page }) => {
    await page.goto(SHELL)
    await page.locator('#lr-table-body tr', { hasText: 'Jane Eyre' }).click()
    await expect(page.locator('#op-page')).toBeVisible()
    const before = await total(page)
    const url = page.url()

    await col(page, 0).getByRole('button', { name: 'Create' }).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 0).locator('.hf-table-toolbar__title')).toContainText(`(${(before + 1).toLocaleString('en-US')})`)
    expect(page.url()).not.toBe(url) // the refresh of the list did not touch the URL of the page that is open
    expect(hash(page)).toMatch(/Books\(IsActiveEntity=false,ID='[^']+'\)$/)
    // the draft is one of the rows: asked for by its status it is the only one
    await col(page, 0).locator('select[name="f.EditingStatus"]').selectOption('OWN_DRAFT')
    await col(page, 0).getByRole('button', { name: 'Go' }).click()
    await expect(draftRows(page)).toHaveCount(1)
    await expect(draftRows(page).first()).toContainText('Draft')

    // Discard: the draft is no row any more, without a reload (a new draft has nothing to go back to: the List Report is shown again)
    await col(page, 1).getByRole('button', { name: 'Discard Draft' }).click()
    await page.locator('.hf-confirm-popover__ok').click({ timeout: 2000 }).catch(() => {}) // a new draft is asked about
    await expect(draftRows(page)).toHaveCount(0)
    await expect.poll(() => total(page)).toBe(before)
  })

  test('Edit on a book turns its row into the draft, Discard Draft brings the saved row back', async ({ page }) => {
    await page.goto(SHELL)
    await page.locator('#lr-table-body tr', { hasText: 'Jane Eyre' }).click()
    await editButton(page, 1).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    // like FE's "All": the edited book is one row, its draft, with the Draft indicator
    await expect(draftRows(page)).toHaveCount(1)
    await expect(draftRows(page).first()).toContainText('Jane Eyre')
    await expect(draftRows(page).first()).toContainText('Draft')

    await col(page, 1).getByRole('button', { name: 'Discard Draft' }).click()
    await expect(draftRows(page)).toHaveCount(0)
    await expect(col(page, 0).locator('tr', { hasText: 'Jane Eyre' }).first()).not.toContainText('Draft')
  })
})

test.describe('drafts in the column layout: one root, the first page', () => {
  test('the sub-object page in the columns has no Edit: the draft belongs to the first page', async ({ page }) => {
    await openChapter(page)
    await expect(editButton(page, 1)).toBeVisible()
    await expect(editButton(page, 2)).toHaveCount(0)
  })

  test('Edit on the first page keeps the third column and makes it editable', async ({ page }) => {
    await openChapter(page)
    await expect(editButton(page, 1)).toBeVisible()
    await expect(col(page, 2).locator('.hf-page--edit')).toHaveCount(0)
    expect(hash(page)).toMatch(/chapters\(ID='[^']+',IsActiveEntity=true\)$/)

    await editButton(page, 1).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    // the third column is still there and now shows the draft of the same chapter
    await expect(col(page, 2).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 2).locator('input[name=title]')).toBeVisible()
    await expect(editButton(page, 2)).toHaveCount(0)
    await expect.poll(() => hash(page)).toMatch(/Books\(ID='[^']+',IsActiveEntity=false\)\/chapters\(ID='[^']+',IsActiveEntity=false\)$/)
    expect(await page.locator('#fcl').getAttribute('data-hf-layout')).toBe('ThreeColumnsEndExpanded')

    // an edit in the third column is saved into the one draft (its own ids, its own status)
    await col(page, 2).locator('input[name=pages]').fill('99')
    await col(page, 2).locator('input[name=pages]').blur()
    await expect(page.locator('#c2-op-draft-status')).toContainText('Draft saved')
  })

  test('Discard Draft on the first page: the third column goes back to the saved chapter, unchanged', async ({ page }) => {
    await openChapter(page)
    const pages = await col(page, 2).locator('.hf-field', { hasText: 'Pages' }).first().innerText()
    await editButton(page, 1).click()
    await expect(col(page, 2).locator('input[name=pages]')).toBeVisible()
    await col(page, 2).locator('input[name=pages]').fill('99')
    await col(page, 2).locator('input[name=pages]').blur()
    await expect(page.locator('#c2-op-draft-status')).toContainText('Draft saved')

    await col(page, 1).getByRole('button', { name: 'Discard Draft' }).click()
    await page.locator('.hf-confirm-popover__ok').click()
    await expect(col(page, 1).locator('.hf-page--edit')).toHaveCount(0)
    await expect(col(page, 2).locator('.hf-page--edit')).toHaveCount(0) // saved version again
    await expect(col(page, 2).locator('input[name=pages]')).toHaveCount(0)
    await expect(col(page, 2).locator('.hf-field', { hasText: 'Pages' }).first()).toHaveText(pages)
    expect(hash(page)).toMatch(/chapters\(ID='[^']+',IsActiveEntity=true\)$/)
    expect(await page.locator('#fcl').getAttribute('data-hf-layout')).toBe('ThreeColumnsEndExpanded')
  })

  test('Save on the first page: the third column shows the saved chapter', async ({ page }) => {
    await openChapter(page)
    await editButton(page, 1).click()
    await expect(col(page, 2).locator('input[name=pages]')).toBeVisible()
    await col(page, 1).getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('#toast')).toContainText('Object saved.')
    await expect(col(page, 1).locator('.hf-page--edit')).toHaveCount(0)
    await expect(col(page, 2).locator('.hf-page--edit')).toHaveCount(0)
    await expect(col(page, 2).locator('input[name=pages]')).toHaveCount(0)
    expect(hash(page)).toMatch(/chapters\(ID='[^']+',IsActiveEntity=true\)$/)
  })

  test('a chapter opened while the first page is being edited is the draft, Apply closes the column', async ({ page }) => {
    await page.goto(SHELL)
    await page.locator('#lr-table-body tr', { hasText: 'Jane Eyre' }).click()
    await editButton(page, 1).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    await col(page, 1).locator('#op-section--Chapters tbody tr').first().locator('.hf-col-nav').click()
    await expect(page.locator('#c2-op-page.hf-page--edit')).toBeVisible()
    await expect(editButton(page, 2)).toHaveCount(0)
    await expect(col(page, 2).getByRole('button', { name: 'Apply' })).toBeVisible()
    await col(page, 2).getByRole('button', { name: 'Apply' }).click()
    await expect(col(page, 2).locator('.hf-page')).toHaveCount(0)
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible() // still editing the book
  })
})
