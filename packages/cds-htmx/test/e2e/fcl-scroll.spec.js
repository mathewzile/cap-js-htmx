const { test, expect } = require('@playwright/test')

const AUTHOR = "/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)"
const column = (page, n) => page.locator(`#fcl-col-${n}`)
const scroller = (page, n) => column(page, n).locator('.hf-fcl__scroll')
// the author page with its first ten books fits a tall window: show more, so that there is something to scroll
const showMoreBooks = async page => {
  for (const loaded of [20, 30]) {
    await page.locator('#op-section--Books-growing .hf-table__growing-button').click()
    await expect(page.locator('#op-section--Books tbody tr[hx-get]')).toHaveCount(loaded)
  }
}
const metrics = (page, n) => scroller(page, n).evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight, overflowY: getComputedStyle(el).overflowY }))

test.afterEach(async ({ request }) => { await request.delete('/admin/Authors(ID=9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002,IsActiveEntity=false)').catch(() => {}) })

test.describe('every column of the layout scrolls on its own', () => {
  test('the window does not scroll, the column does', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await showMoreBooks(page)
    await page.waitForTimeout(700)
    const doc = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: innerHeight }))
    expect(doc.scroll).toBeLessThanOrEqual(doc.inner + 1) // the page itself has no scrollbar
    const mid = await metrics(page, 1)
    expect(mid.overflowY).toBe('auto')
    expect(mid.height).toBeGreaterThan(mid.client + 200) // the author page with its 20 books is longer than the window
    expect(mid.client).toBeLessThanOrEqual(doc.inner)
  })

  test('scrolling one column leaves the others where they are; header and footer stay in their column', async ({ page }) => {
    await page.goto("/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)")
    await expect(page.locator('#op-page')).toBeVisible()
    await expect(column(page, 0).locator('#lr-table-body tr').first()).toBeVisible()
    await showMoreBooks(page)
    await page.waitForTimeout(700)
    await scroller(page, 1).evaluate(el => { el.scrollTop = 150 })
    expect((await metrics(page, 1)).top).toBe(150)
    expect((await metrics(page, 0)).top).toBe(0)
    // the sticky header of the page stays at the top of its column
    const header = await page.locator('#op-header').boundingBox()
    const box = await column(page, 1).boundingBox()
    expect(Math.abs(header.y - box.y)).toBeLessThan(2)
    // the grip stays in the middle of what is visible
    await column(page, 1).locator('[data-hf-sep]').hover()
    const grip = await column(page, 1).locator('.hf-fcl__grip').boundingBox()
    expect(Math.abs(grip.y + grip.height / 2 - (box.y + box.height / 2))).toBeLessThan(3)
  })

  test('the footer of an edited page stays at the bottom of its column while it scrolls', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.locator('#op-page').getByRole('button', { name: 'Edit' }).click()
    const footer = page.locator('#op-footer')
    await expect(footer).toBeVisible()
    await scroller(page, 1).evaluate(el => { el.scrollTop = el.scrollHeight })
    const [f, box] = [await footer.boundingBox(), await column(page, 1).boundingBox()]
    expect(f.y + f.height).toBeLessThanOrEqual(box.y + box.height + 1)
    expect(f.y).toBeGreaterThan(box.y + box.height - 80)
  })

  test('a third column scrolls on its own too, and its separator is the column\'s', async ({ page }) => {
    await page.goto(AUTHOR)
    await page.locator('#op-section--Books tbody tr[hx-get]').first().click()
    await expect(page.locator('#c2-op-page')).toBeVisible()
    await showMoreBooks(page)
    await page.waitForTimeout(700)
    expect((await metrics(page, 2)).overflowY).toBe('auto')
    await scroller(page, 1).evaluate(el => { el.scrollTop = 120 })
    expect((await metrics(page, 1)).top).toBe(120)
    expect((await metrics(page, 2)).top).toBe(0)
  })
})
