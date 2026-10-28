const { test, expect } = require('@playwright/test')

// The welcome page of `cds serve` (lib/index-page.js): cds-plugin-ui5 rewrites its list of web apps for an older cds, which left the
// htmx apps out and repeated its own links; the "Fiori preview" of a service is one per protocol.
test.describe('the welcome page', () => {
  test('lists the htmx apps once, and the UI5 apps through the links of the UI5 tooling', async ({ page }) => {
    await page.goto('/')
    const apps = page.locator('#webapps a')
    await expect(page.locator('#webapps a[href="/manage-authors-htmx/webapp/index.html"]')).toHaveCount(1)
    await expect(page.locator('#webapps a[href="/manage-books-htmx/webapp/index.html"]')).toHaveCount(1)
    await expect(page.locator('#webapps a[href="/flp-htmx/flpSandbox.html"]')).toHaveCount(1)
    // every link once; the UI5 apps are not listed a second time as plain pages
    const hrefs = await apps.evaluateAll(links => links.map(a => a.getAttribute('href')))
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).not.toContain('/manage-authors/webapp/index.html')
    expect(hrefs.some(href => /^\/manageauthors\//.test(href))).toBe(true)
  })

  test('Fiori preview opens the htmx List Report when htmx is selected, the OData preview when OData is', async ({ page }) => {
    await page.goto('/')
    const service = page.locator('details#adminservice')
    const preview = (protocol, entity) => service.locator(`a[data-protocols="${protocol}"][href$="${entity}"], a[data-protocols="${protocol}"][href*="/${entity}#"]`).first()
    await service.locator('summary').click()
    await service.locator('.protocol-badges [data-protocol=htmx]').click()
    await expect(preview('htmx', 'Authors')).toBeVisible()
    await expect(preview('htmx', 'Authors')).toHaveAttribute('href', '/htmx/admin/Authors')
    await expect(preview('odata', 'Authors')).toBeHidden()
    await service.locator('.protocol-badges [data-protocol=odata]').click()
    await expect(preview('odata', 'Authors')).toBeVisible()
    await expect(preview('odata', 'Authors')).toHaveAttribute('href', /\/\$fiori-preview\/AdminService\/Authors/)
    await expect(preview('htmx', 'Authors')).toBeHidden()
  })
})
