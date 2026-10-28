const { test, expect } = require('@playwright/test')

// The frontend projects open from their source URL during development: the plugin serves the generic shell from
// `cds-htmx-shell` and maps `/<name>/webapp/htmx/...` to `/htmx/...` (cds-plugin.js). The deployed build is not involved.
for (const [app, rows] of [['manage-books-htmx', '#lr-table-body tr'], ['manage-authors-htmx', '#lr-table-body tr']]) {
  test(`${app} starts from its source URL without errors`, async ({ page }) => {
    const problems = []
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
    page.on('requestfailed', r => problems.push(`failed: ${r.url()}`))
    page.on('response', r => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`) })

    await page.goto(`/${app}/webapp/index.html`)
    await expect(page.locator(rows).first()).toBeVisible()
    expect(new URL(page.url()).hash).toBe('') // the entry page has no route: the manifest says where the app starts

    await page.locator(rows).first().click()
    await expect(page.locator('#op-page')).toBeVisible()
    expect(problems).toEqual([])
  })
}

test('manage-authors-htmx opens the Object Page beside the List Report', async ({ page }) => {
  await page.goto('/manage-authors-htmx/webapp/index.html')
  await page.locator('#lr-table-body tr').first().click()
  await expect(page.locator('#op-page')).toBeVisible()
  await expect(page.locator('#fcl-col-0 #lr-table-body tr').first()).toBeVisible()
  expect(await page.locator('#fcl').getAttribute('data-hf-layout')).toBe('TwoColumnsMidExpanded')
})
