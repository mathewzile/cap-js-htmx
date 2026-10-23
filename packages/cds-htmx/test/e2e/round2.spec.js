const { test, expect } = require('@playwright/test')
const fs = require('node:fs')

const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre, 2 chapters
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const confirmOk = page => page.locator('.hf-message-box [data-hf-ok]')

async function edit(page) {
  await page.goto(ACTIVE)
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  await expect(page).toHaveURL(/IsActiveEntity=false/)
}

test.afterEach(async ({ request }) => {
  await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {})
})

test.describe('messages and value states', () => {
  test('an emptied mandatory field, a failed save and a fix', async ({ page }) => {
    await edit(page)
    const title = page.locator('[data-hf-field=title] input[name=title]')
    await title.fill('')
    await title.blur()
    await expect(page.locator('[data-hf-field=title]')).toHaveClass(/hf-field--error/)
    await expect(page.locator('h1').first()).toHaveText('Unnamed Object')
    await expect(page.locator('.hf-msg-button')).toHaveText('1')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await title.focus()
    await expect(page.locator('[data-hf-field=title] .hf-field__message')).toBeVisible()

    await page.locator('.hf-msg-button').click()
    await expect(page.locator('.hf-msg-popover')).toContainText('Provide the missing value.')
    await expect(page.locator('.hf-msg-popover')).toContainText('Title')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/IsActiveEntity=false/) // the failed save stays on the draft
    await expect(page.locator('.hf-msg-button')).toHaveText('1')

    await page.reload() // the draft's persisted messages come back
    await expect(page.locator('[data-hf-field=title]')).toHaveClass(/hf-field--error/)
    await page.locator('[data-hf-field=title] input[name=title]').fill('Jane Eyre')
    await page.locator('[data-hf-field=title] input[name=title]').blur()
    await expect(page.locator('.hf-msg-button')).toHaveCount(0)
    await expect(page.locator('h1').first()).toHaveText('Jane Eyre')
  })
})

test.describe('value help', () => {
  test('modal dialog with search, a row fills the field, F4 / Escape / Cancel', async ({ page }) => {
    await edit(page)
    const author = page.locator('input[name=author_ID]')
    const before = await author.inputValue()
    await page.locator('[data-hf-field=author_ID] .hf-vh-open').click()
    await expect(page.locator('.hf-dialog h2')).toHaveText('Select: Author')
    await expect(page.locator('.hf-vh-row')).toHaveCount(4)
    await expect(page.locator('input[name="$search"]')).toBeFocused()
    await page.locator('input[name="$search"]').fill('Poe')
    await expect(page.locator('.hf-vh-row')).toHaveCount(1)
    await page.locator('.hf-vh-row').click()
    await expect(page.locator('.hf-dialog')).toHaveCount(0)
    await expect(author).not.toHaveValue(before)
    await expect(author).toHaveValue(/^9d703c23.*0003$/)
    await page.reload()
    await expect(page.locator('input[name=author_ID]')).toHaveValue(/0003$/) // the draft was PATCHed

    await page.locator('input[name=author_ID]').focus()
    await page.keyboard.press('F4')
    await expect(page.locator('.hf-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.hf-dialog')).toHaveCount(0)
    await page.locator('[data-hf-field=author_ID] .hf-vh-open').click()
    await page.locator('[data-hf-dialog-close]').click()
    await expect(page.locator('.hf-dialog')).toHaveCount(0)
  })
})

test.describe('composition children in a draft', () => {
  const section = page => page.locator('#op-section--Chapters')

  test('inline cells, a new child page with Apply, deleting children', async ({ page }) => {
    await edit(page)
    const draftUrl = page.url()
    const rows = section(page).locator('tbody input[name=title]')
    await expect(rows).toHaveCount(2)
    await expect(section(page).locator('th .hf-field__required')).toHaveCount(1)

    const first = rows.first()
    await first.fill('')
    await first.blur()
    await expect(section(page).locator('.hf-field--error')).toHaveCount(1)
    await expect(page.locator('.hf-msg-button')).toHaveText('1')
    await first.fill('I. Gateshead edited')
    await first.blur()
    await expect(page.locator('.hf-msg-button')).toHaveCount(0)
    expect(page.url()).toBe(draftUrl)

    await section(page).getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/chapters\(ID='[0-9a-f-]{36}',IsActiveEntity=false\)$/)
    await expect(page.locator('h1').first()).toHaveText('New Chapter')
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await page.locator('[data-hf-field=title] input[name=title]').fill('Brand new chapter')
    await page.locator('[data-hf-field=title] input[name=title]').blur()
    await expect(page.locator('h1').first()).toHaveText('Brand new chapter')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(draftUrl)
    await expect(rows).toHaveCount(3)

    // the arrow opens a child, Back returns, Delete on the child page asks first
    await section(page).locator('tbody tr').nth(2).locator('.hf-col-nav').click()
    await expect(page).toHaveURL(/\/chapters\(/)
    await page.locator('.hf-op-title__actions').getByRole('button', { name: 'Delete' }).click()
    await confirmOk(page).click()
    await expect(page).toHaveURL(draftUrl)
    await expect(rows).toHaveCount(2)

    // bulk delete of ticked rows has its own (section-scoped) button
    const remove = section(page).getByRole('button', { name: 'Delete' })
    await expect(remove).toBeDisabled()
    await section(page).locator('tbody tr').first().locator('.hf-checkbox').check()
    await expect(remove).toBeEnabled()
    await remove.click()
    await confirmOk(page).click()
    await expect(rows).toHaveCount(1)

    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await confirmOk(page).click()
    await page.reload()
    await expect(section(page).locator('tbody tr')).toHaveCount(2) // the saved chapters were never touched
  })
})

test.describe('table tools', () => {
  test('List Report: view settings, sort, export, adapt filters, filter value help, saved views', async ({ page }, testInfo) => {
    await page.goto('/htmx/catalog/Books')
    const headers = page.locator('#lr-table thead th.hf-th:not([hidden])')
    await expect(headers).toHaveCount(5)

    await page.locator('[data-hf-action=settings]').click()
    await page.locator('.hf-dialog__row', { hasText: 'Stock' }).locator('input').uncheck()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(headers).toHaveCount(4)
    await page.reload()
    await expect(headers).toHaveCount(4) // remembered

    await page.locator('[data-hf-action=settings]').click()
    await page.locator('.hf-dialog__tab', { hasText: 'Sort' }).click()
    await page.locator('.hf-dialog select').first().selectOption({ label: 'Price' })
    await page.getByRole('button', { name: 'Descending' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('#lr-table-body tr').first()).toContainText('Wuthering Heights')
    await expect(headers).toHaveCount(4)

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-hf-action=export]').click()])
    const file = testInfo.outputPath('books.csv')
    await download.saveAs(file)
    const csv = fs.readFileSync(file, 'utf8')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.split('\r\n')[0]).toContain('Book Title (XML override),Status,Author,Price')
    expect(csv.trim().split('\r\n')).toHaveLength(1006) // the header and all 1005 books, more than one query returns

    await page.locator('[data-hf-action=settings]').click()
    await page.getByRole('button', { name: 'Reset' }).click() // back to all columns, applied with OK
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(headers).toHaveCount(5)

    await page.getByRole('button', { name: /Adapt Filters/ }).click()
    await page.locator('.hf-dialog__row', { hasText: 'Genre' }).locator('input').uncheck()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[data-hf-filter=genre_ID]')).toBeHidden()

    await page.locator('[data-hf-filter=author_ID] .hf-vh-open').click()
    await page.locator('.hf-vh-row', { hasText: 'Poe' }).click()
    await expect(page.locator('[name="f.author_ID"]')).toHaveValue(/0003$/)
    await page.getByRole('button', { name: 'Go' }).click()
    await expect(page.locator('#lr-table-body tr')).toHaveCount(20) // a page of Poe's books
    await expect(page.locator('#lr-table-body td.hf-col-3').filter({ hasNotText: 'Edgar Allan Poe' })).toHaveCount(0)

    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.getByRole('button', { name: /Save As/ }).click()
    await page.locator('.hf-dialog input').fill('Poe only')
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('[data-hf-variant-title]')).toHaveText('Poe only')
    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.locator('#hf-variants .hf-popover__item', { hasText: /^Standard$/ }).click()
    await expect(page.locator('#lr-table-body td.hf-col-3').filter({ hasNotText: 'Edgar Allan Poe' })).not.toHaveCount(0) // all authors again
    await expect(page.locator('[data-hf-filter=genre_ID]')).toBeVisible()
    await page.locator('#hf-variants [data-hf-popover-toggle]').click()
    await page.locator('#hf-variants .hf-popover__item', { hasText: 'Poe only' }).click()
    await expect(page.locator('#lr-table-body tr')).toHaveCount(20) // a page of Poe's books
    await expect(page.locator('#lr-table-body td.hf-col-3').filter({ hasNotText: 'Edgar Allan Poe' })).toHaveCount(0)
    await expect(page.locator('[data-hf-filter=genre_ID]')).toBeHidden()
  })

  test('a table section: search, CSV of what is shown, hiding a column', async ({ page }, testInfo) => {
    await page.goto(ACTIVE)
    const section = page.locator('#op-section--Chapters')
    await section.locator('[data-hf-table-search]').fill('Lowood')
    await expect(section.locator('tbody tr:not([hidden])')).toHaveCount(1)
    await section.locator('[data-hf-table-search]').fill('')
    const [download] = await Promise.all([page.waitForEvent('download'), section.locator('[data-hf-action=export-section]').click()])
    const file = testInfo.outputPath('chapters.csv')
    await download.saveAs(file)
    expect(fs.readFileSync(file, 'utf8')).toContain('Title,Pages\r\nI. Gateshead,14\r\nII. Lowood School,20')
    await section.locator('[data-hf-action=settings]').click()
    await page.locator('.hf-dialog__row', { hasText: 'Pages' }).locator('input').uncheck()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(section.locator('thead th.hf-th:not([hidden])')).toHaveCount(1)
  })
})

test('the rating rounds to half stars', async ({ page }) => {
  await page.goto(ACTIVE) // 4.7 -> 4.5 stars
  const fill = await page.locator('.hf-rating__fill').first().evaluate(el => parseFloat(el.style.width))
  expect(fill).toBeGreaterThan(85)
  expect(fill).toBeLessThan(92)
})
