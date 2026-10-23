const { test, expect } = require('@playwright/test')

// catalog Books has no motion setting: full motion (the Authors app of this repo says "fast")
const animations = page => page.evaluate(() => document.getAnimations().map(a => `${a.animationName}:${a.effect.getTiming().duration}`))
const overlay = page => page.locator('.hf-overlay')

test.describe('dialogs animate like FE\'s', () => {
  test('View Settings fades its block layer in and the dialog grows in; Cancel does it backwards, then removes it', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await expect(page.locator('#lr-table-body tr').first()).toBeVisible()
    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(overlay(page)).toBeVisible()
    expect(await animations(page)).toEqual(expect.arrayContaining(['hf-overlay-in:200', 'hf-dialog-in:200']))
    await page.waitForTimeout(350)

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(overlay(page)).toHaveClass(/is-closing/) // still there, on its way out
    expect(await animations(page)).toEqual(expect.arrayContaining(['hf-overlay-out:150', 'hf-dialog-out:150']))
    await expect(overlay(page)).toHaveCount(0)
  })

  test('Escape closes with the same animation', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(overlay(page)).toBeVisible()
    await page.waitForTimeout(350)
    await page.keyboard.press('Escape')
    await expect(overlay(page)).toHaveClass(/is-closing/)
    await expect(overlay(page)).toHaveCount(0)
  })

  test('the value help dialog (server-rendered) and the confirmation box animate too', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('.hf-filter[data-hf-filter=author_ID] .hf-vh-open').click()
    await expect(page.locator('.hf-dialog--value-help')).toBeVisible()
    expect(await animations(page)).toEqual(expect.arrayContaining(['hf-dialog-in:200']))
    await page.waitForTimeout(350)
    await page.locator('[data-hf-dialog-close]').first().click()
    await expect(overlay(page)).toHaveClass(/is-closing/)
    await expect(overlay(page)).toHaveCount(0)

    const answer = page.evaluate(() => window.hfConfirmDialog({ title: 'Delete', text: 'Really?', ok: 'Delete', cancel: 'Cancel' }))
    await expect(page.locator('.hf-message-box')).toBeVisible()
    expect(await animations(page)).toEqual(expect.arrayContaining(['hf-dialog-in:200']))
    await page.waitForTimeout(350)
    await page.locator('[data-hf-ok]').click()
    await expect(overlay(page)).toHaveClass(/is-closing/)
    expect(await answer).toBe(true) // the answer does not wait for the animation
    await expect(overlay(page)).toHaveCount(0)
  })

  test('picking a value in the value help closes it with the animation', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.locator('.hf-filter[data-hf-filter=author_ID] .hf-vh-open').click()
    await expect(page.locator('.hf-vh-row').first()).toBeVisible()
    await page.waitForTimeout(350)
    await page.locator('.hf-vh-row').first().click()
    await expect(overlay(page)).toHaveCount(0)
    await expect(page.locator('[name="f.author_ID"]')).not.toHaveValue('')
  })

  test('with animations: fast the durations are half, with none the dialog opens and closes at once', async ({ page }) => {
    await page.goto('/htmx/catalog/Books')
    await page.evaluate(() => document.body.classList.add('hf-motion-fast'))
    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(overlay(page)).toBeVisible()
    expect(await animations(page)).toEqual(expect.arrayContaining(['hf-dialog-in:100']))
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(overlay(page)).toHaveCount(0)

    await page.evaluate(() => { document.body.classList.remove('hf-motion-fast'); document.body.classList.add('hf-no-motion') })
    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(overlay(page)).toBeVisible()
    expect(await animations(page)).toEqual([])
    const stillThere = await page.evaluate(() => { document.querySelector('.hf-overlay .hf-dialog__footer button:last-child').click(); return !!document.querySelector('.hf-overlay') })
    expect(stillThere).toBe(false) // removed in the same tick
  })

  test('prefers-reduced-motion switches the animation off', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/htmx/catalog/Books')
    await page.getByRole('button', { name: 'View Settings' }).click()
    await expect(overlay(page)).toBeVisible()
    expect(await animations(page)).toEqual([])
    await context.close()
  })
})
