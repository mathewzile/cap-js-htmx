const { test, expect } = require('@playwright/test')

const AUTHOR = "/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002',IsActiveEntity=true)"
const column = (page, n) => page.locator(`#fcl-col-${n}`)
const width = async (page, n) => (await column(page, n).boundingBox())?.width ?? 0
const layout = page => page.locator('#fcl').getAttribute('data-hf-layout')
const separator = (page, n) => column(page, n).locator('[data-hf-sep]')
// the Authors app of this repo says "animations": "fast" in its manifest; the timing tests want the full-length animation
const fullMotion = page => page.evaluate(() => document.body.classList.remove('hf-motion-fast', 'hf-no-motion'))

test.describe('flexible column layout: separator and animation', () => {
  test('dragging the separator resizes the two columns beside it, within limits', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.waitForTimeout(800) // the opening animation

    const [begin, mid] = [await width(page, 0), await width(page, 1)]
    const box = await separator(page, 1).boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + 300
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 150, y, { steps: 6 })
    await expect(page.locator('#fcl')).toHaveClass(/hf-fcl--dragging/)
    await page.mouse.up()
    await expect(page.locator('#fcl')).not.toHaveClass(/hf-fcl--dragging/)

    const [begin2, mid2] = [await width(page, 0), await width(page, 1)]
    expect(begin2).toBeGreaterThan(begin + 100)
    expect(mid2).toBeLessThan(mid - 100)
    expect(Math.abs(begin2 + mid2 - (begin + mid))).toBeLessThan(2) // what one gets the other loses

    // never narrower than 15% of the layout
    const total = begin2 + mid2
    const box2 = await separator(page, 1).boundingBox()
    await page.mouse.move(box2.x + 4, y)
    await page.mouse.down()
    await page.mouse.move(box2.x + 4 + 2000, y, { steps: 4 })
    await page.mouse.up()
    expect(await width(page, 1)).toBeGreaterThanOrEqual(total * 0.15 - 2)
  })

  test('the arrow keys on the separator resize, a layout change goes back to the layout widths', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.waitForTimeout(800)
    const before = await width(page, 0)
    await separator(page, 1).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => width(page, 0)).toBeGreaterThan(before + 20)
    await expect(page.locator('#fcl')).toHaveAttribute('data-hf-custom', '')

    await column(page, 1).locator('[data-hf-fcl-fullscreen]').click()
    await expect(page.locator('#fcl')).not.toHaveAttribute('data-hf-custom', '')
  })

  test('the arrow swaps which column is wide, animated', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await fullMotion(page)
    await page.waitForTimeout(800)
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')
    const start = await width(page, 0)

    await separator(page, 1).hover()
    const arrow = separator(page, 1).locator('[data-hf-fcl-arrow]')
    await expect(arrow).toBeVisible()
    await arrow.click()
    expect(await layout(page)).toBe('TwoColumnsBeginExpanded')
    await page.waitForTimeout(150)
    const during = await width(page, 0)
    await page.waitForTimeout(900)
    const end = await width(page, 0)
    expect(end).toBeGreaterThan(start + 200)
    expect(during).toBeGreaterThan(start) // on its way ...
    expect(during).toBeLessThan(end - 5) // ... and not there yet

    await separator(page, 1).hover()
    await expect(arrow.locator('i')).toHaveClass(/slim-arrow-left/)
    await arrow.click()
    expect(await layout(page)).toBe('TwoColumnsMidExpanded')
  })

  test('a column that opens grows from nothing', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    await fullMotion(page)
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    expect(await width(page, 1)).toBe(0)
    await page.locator('#lr-table-body tr').first().click()
    await page.waitForTimeout(120)
    const during = await width(page, 1)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.waitForTimeout(900)
    const end = await width(page, 1)
    expect(during).toBeLessThan(end - 20)
  })

  test('the separator belongs to the column, the first column has none', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await expect(separator(page, 1)).toHaveCount(1)
    await expect(column(page, 0).locator('[data-hf-sep]')).toHaveCount(0)
    await expect(separator(page, 1)).toHaveAttribute('role', 'separator')
    await expect(separator(page, 1)).toHaveAttribute('aria-label', 'Resize Columns')
  })
})

test.describe('sap.htmx.animations: false (hf-no-motion on the page)', () => {
  test('nothing is animated: a layout change is immediate and no element has a transition', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await page.evaluate(() => document.body.classList.add('hf-no-motion')) // what the server (or the shell, from $shell) puts there
    await page.waitForTimeout(100)

    const durations = await page.evaluate(() => [...document.querySelectorAll('.hf-fcl__col, .hf-fcl__sep::before, .fd-button, .hf-fcl__arrow, .hf-fcl__grip')]
      .map(el => getComputedStyle(el).transitionDuration))
    expect(durations.length).toBeGreaterThan(3)
    expect(new Set(durations)).toEqual(new Set(['0s']))

    const start = await width(page, 0)
    await separator(page, 1).hover()
    await separator(page, 1).locator('[data-hf-fcl-arrow]').click()
    await page.waitForTimeout(30) // the animated version is still in motion here
    const end = await page.evaluate(() => document.querySelector('#fcl-col-0').getBoundingClientRect().width)
    await page.waitForTimeout(700)
    expect(Math.abs(end - (await width(page, 0)))).toBeLessThan(1)
    expect(end).toBeGreaterThan(start + 200)
  })
})

test.describe('sap.htmx.animations: fast', () => {
  test('hf-motion-fast makes every duration half as long', async ({ page }) => {
    await page.goto(AUTHOR)
    await expect(page.locator('#op-page')).toBeVisible()
    await fullMotion(page)
    const seconds = async () => page.evaluate(() => [...document.querySelectorAll('.hf-fcl__col, .hf-fcl__grip, .hf-fcl__arrow')]
      .map(el => getComputedStyle(el).transitionDuration.split(',').map(d => parseFloat(d))).flat())
    const full = await seconds()
    await page.evaluate(() => document.body.classList.add('hf-motion-fast'))
    const fast = await seconds()
    expect(fast.length).toBe(full.length)
    fast.forEach((d, i) => expect(d).toBeCloseTo(full[i] * 0.5, 3))
    expect(Math.max(...fast)).toBeCloseTo(0.28, 3)

    // and the layout change is over in about that time
    await page.waitForTimeout(100)
    const start = await width(page, 0)
    await separator(page, 1).hover()
    await separator(page, 1).locator('[data-hf-fcl-arrow]').click()
    await page.waitForTimeout(350)
    const end = await width(page, 0)
    await page.waitForTimeout(500)
    expect(Math.abs(end - (await width(page, 0)))).toBeLessThan(1)
    expect(end).toBeGreaterThan(start + 200)
  })
})

test.describe('the shell and the launchpad animation mode', () => {
  test('the calmer of the app\'s motion and UI5\'s animation mode applies', async ({ page }) => {
    await page.goto('/manage-books-htmx/webapp/index.html')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    const table = await page.evaluate(() => [
      ['full', undefined], ['full', 'full'], ['full', 'basic'], ['full', 'minimal'], ['full', 'none'],
      ['fast', 'full'], ['fast', 'basic'], ['fast', 'none'], ['none', 'full'], [false, 'full'], [true, 'full'], [undefined, 'minimal']
    ].map(([app, ui5]) => window.HtmxShell.motionFor(app, ui5)))
    expect(table).toEqual(['full', 'full', 'fast', 'fast', 'none', 'fast', 'fast', 'none', 'none', 'none', 'full', 'fast'])
  })

  test('the launchpad adapter reads UI5\'s animation mode and hears about changes', async ({ page }) => {
    await page.goto('/manage-books-htmx/webapp/index.html')
    await page.addScriptTag({ url: '/manage-books-htmx/webapp/shell/flp.js' }) // the launchpad adapter, which only the UI5 component loads
    const result = await page.evaluate(() => {
      let mode = 'basic'
      let listener
      const ui5 = {
        HashChanger: { getInstance: () => ({ attachEvent() {}, getHash: () => '' }) },
        Theming: { getTheme: () => 'sap_horizon', attachApplied() {} },
        ControlBehavior: { getAnimationMode: () => mode, attachChange: fn => { listener = fn } }
      }
      const adapter = window.HtmxShellAdapters.flp(ui5)
      const seen = [adapter.animationMode()]
      adapter.onAnimationMode(value => seen.push(value))
      mode = 'none'
      listener()
      return seen
    })
    expect(result).toEqual(['basic', 'none'])
  })
})
