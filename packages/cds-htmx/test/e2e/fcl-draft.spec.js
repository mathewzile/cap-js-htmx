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
  await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {})
})

async function openChapter(page) {
  await page.goto(SHELL)
  await page.locator('#lr-table-body tr', { hasText: 'Jane Eyre' }).click()
  await expect(page.locator('#op-page')).toBeVisible()
  await page.locator('#op-section--Chapters tbody tr[hx-get]').first().click()
  await expect(page.locator('#c2-op-page')).toBeVisible()
}

test.describe('drafts in the column layout: one root, the first page', () => {
  test('Edit on the sub-object page edits the first page and keeps the chapter open as the draft', async ({ page }) => {
    await openChapter(page)
    await expect(editButton(page, 2)).toBeVisible()
    await editButton(page, 2).click()
    await expect(col(page, 1).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 2).locator('.hf-page--edit')).toBeVisible()
    await expect(col(page, 2).locator('input[name=title]')).toBeVisible()
    await expect(editButton(page, 2)).toHaveCount(0)
    await expect.poll(() => hash(page)).toMatch(/Books\(ID='[^']+',IsActiveEntity=false\)\/chapters\(ID='[^']+',IsActiveEntity=false\)$/)
    expect(await page.locator('#fcl').getAttribute('data-hf-layout')).toBe('ThreeColumnsEndExpanded')
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
