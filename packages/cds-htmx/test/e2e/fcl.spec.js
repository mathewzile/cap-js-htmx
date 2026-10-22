const { test, expect } = require('@playwright/test')

const CHARLOTTE = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002'
const AUTHOR = `/htmx/admin/Authors(ID='${CHARLOTTE}')`

const pathOf = page => decodeURIComponent(page.url().replace(/^https?:\/\/[^/]+/, ''))
const column = (page, n) => page.locator(`#fcl-col-${n}`)
const layout = page => page.locator('#fcl').getAttribute('data-hf-layout')
const widthOf = async (page, n) => Math.round((await column(page, n).boundingBox())?.width ?? 0)

test.describe('flexible column layout (admin Authors: List Report | Author | Book)', () => {
  test('a row opens the Object Page beside the List Report, a book opens the third column', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    expect(await layout(page)).toBe('OneColumn')
    await expect(column(page, 1)).toBeHidden()

    // List Report row -> second column; the list stays, the row is marked
    await page.locator('#lr-table-body tr', { hasText: 'Charlotte' }).click()
    await expect(page.locator('#op-page')).toBeVisible()
    expect(pathOf(page)).toBe(AUTHOR)
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')
    await expect(column(page, 0).locator('#lr-table-body tr').first()).toBeVisible()
    await expect(column(page, 0).locator('tr.is-selected')).toHaveCount(1)
    await expect.poll(async () => (await widthOf(page, 1)) > (await widthOf(page, 0))).toBe(true) // the columns animate to their widths

    // a book of the author -> third column, the author page stays
    await column(page, 1).locator('tbody tr[hx-get]', { hasText: 'Jane Eyre' }).click()
    await expect(page.locator('#c2-op-page')).toBeVisible()
    expect(pathOf(page).startsWith(`${AUTHOR}/books(`)).toBe(true)
    expect(await layout(page)).toBe('ThreeColumnsEndExpanded')
    await expect(page.locator('#op-page')).toBeVisible()
    await expect.poll(async () => (await widthOf(page, 2)) > (await widthOf(page, 1))).toBe(true)
    await expect(page.locator('#op-page, #c2-op-page')).toHaveCount(2)
  })

  test('Close trims the columns, full screen toggles, a reload of a deep link rebuilds all columns', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await expect(column(page, 0).locator('#lr-table-body tr').first()).toBeVisible() // loaded beside the page
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')

    const fullScreen = column(page, 1).locator('[data-hf-fcl-fullscreen]')
    await fullScreen.click()
    expect(await layout(page)).toBe('MidColumnFullScreen')
    await expect(column(page, 0)).toBeHidden()
    await expect(fullScreen).toHaveAttribute('aria-pressed', 'true')
    await fullScreen.click()
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')

    await column(page, 1).locator('button[aria-label="Close"]').click()
    await expect(page).toHaveURL(/\/htmx\/admin\/Authors$/)
    expect(await layout(page)).toBe('OneColumn')
    await expect(column(page, 1)).toBeHidden()
    await expect(page.locator('#op-page')).toHaveCount(0)

    // browser back restores the Object Page
    await page.goBack()
    await expect(page.locator('#op-page')).toBeVisible()
    expect(pathOf(page)).toBe(AUTHOR)
  })

  test('editing in a column keeps the layout and the other columns', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.locator('#op-page').getByRole('button', { name: 'Edit' }).click()
    await expect(page.locator('input[name=name]')).toBeVisible()
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')
    await expect(column(page, 0).locator('#lr-table-body tr').first()).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('#op-page').getByRole('button', { name: 'Edit' })).toBeVisible()
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')
  })
})
