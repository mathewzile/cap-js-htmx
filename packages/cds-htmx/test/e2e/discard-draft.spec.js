const { test, expect } = require('@playwright/test')

// What FE does (checked on the FE app): an untouched draft is discarded at once with a "Draft discarded" toast, a changed one is asked
// about in a small popover over the button, and a Save that fails opens the message popover by itself
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const title = page => page.locator('[data-hf-field=title] input[name=title]')
const popover = page => page.locator('.hf-confirm-popover')
const edit = async page => { await page.goto(ACTIVE); await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expect(title(page)).toBeVisible() }

test.describe('discarding a draft and a failed save', () => {
  test.afterEach(async ({ request }) => { await request.delete(`/odata/v4/catalog/Books(ID=${BOOK},IsActiveEntity=false)`).catch(() => {}) })

  test('an untouched draft is discarded without a question', async ({ page }) => {
    await edit(page)
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(page.locator('#toast')).toContainText('Draft discarded')
    await expect(page.getByRole('button', { name: 'Edit', exact: true }).first()).toBeVisible()
    await expect(popover(page)).toHaveCount(0)
    await expect(page.locator('.hf-message-box')).toHaveCount(0)
  })

  test('a changed draft is asked about in a popover; Escape keeps it, Discard drops it', async ({ page }) => {
    await edit(page)
    await title(page).fill('Jane Eyre changed')
    await title(page).press('Tab')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(popover(page)).toContainText('Discard all changes?')
    await expect(page.locator('.hf-message-box')).toHaveCount(0) // a popover, not a message box
    await page.keyboard.press('Escape')
    await expect(popover(page)).toHaveCount(0)
    await expect(title(page)).toHaveValue('Jane Eyre changed') // kept

    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await popover(page).getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(page.locator('#toast')).toContainText('Draft discarded')
    await expect(page.locator('h1').first()).toHaveText('Jane Eyre')
  })

  // The numbers of sap.m.Popover (showHeader false, placement Top, sapUiContentPadding) around a Text and a full-width Button,
  // measured in the Fiori elements Books app (Horizon, compact): that is what the popover has to look like
  test('the popover has the metrics of the Fiori elements one', async ({ page }) => {
    await edit(page)
    await title(page).fill('Jane Eyre metrics')
    await title(page).press('Tab')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    const trigger = page.getByRole('button', { name: 'Discard Draft' })
    await trigger.click()
    await expect(popover(page)).toBeVisible()
    await expect(trigger).toBeDisabled() // FE: the button that asked is off while the question is open
    const m = await page.evaluate(() => {
      const pop = document.querySelector('.hf-confirm-popover')
      const text = pop.querySelector('.hf-confirm-popover__text')
      const ok = pop.querySelector('.hf-confirm-popover__ok')
      const arrow = pop.querySelector('.hf-confirm-popover__arrow')
      const c = el => getComputedStyle(el)
      const box = el => el.getBoundingClientRect()
      return {
        padding: c(pop).padding, radius: c(pop).borderRadius, shadow: c(pop).boxShadow, font: c(pop).fontFamily, size: c(text).fontSize, color: c(text).color,
        textH: box(text).height, okH: box(ok).height, okRadius: c(ok).borderRadius, okBorder: c(ok).borderTopColor, okColor: c(ok).color, okFont: c(ok).fontSize,
        gap: box(ok).top - box(text).bottom, okW: box(ok).width - box(text).width, arrow: [box(arrow).width, box(arrow).height],
        width: box(pop).width - box(text).width
      }
    })
    expect(m.padding).toBe('18px 17px 20px')
    expect(m.radius).toBe('8px')
    expect(m.shadow).toContain('rgba(34, 53, 72, 0.48) 0px 0px 0px 1px')
    expect(m.font).toContain('72')
    expect(m.size).toBe('14px')
    expect(m.color).toBe('rgb(19, 30, 41)')
    expect(m.textH).toBe(16)
    expect(m.okH).toBe(26)
    expect(m.okRadius).toBe('8px')
    expect(m.okBorder).toBe('rgb(188, 195, 202)')
    expect(m.okColor).toBe('rgb(0, 100, 217)')
    expect(m.okFont).toBe('14px')
    expect(m.gap).toBe(4)
    expect(m.okW).toBe(0) // width 100%
    expect(m.width).toBe(34)
    expect(m.arrow).toEqual([16, 8])
    await page.keyboard.press('Escape')
    await expect(trigger).toBeEnabled()
  })

  test('a draft that is opened again after it was changed is asked about, even after a reload', async ({ page }) => {
    await edit(page)
    await title(page).fill('Jane Eyre again')
    await title(page).press('Tab')
    await expect(page.locator('#op-draft-status')).toContainText('Draft saved')
    await page.reload()
    await page.getByRole('button', { name: 'Discard Draft' }).click()
    await expect(popover(page)).toBeVisible()
  })

  test('a Save that fails shows its messages without a click', async ({ page }) => {
    await edit(page)
    await title(page).fill('')
    await title(page).press('Tab')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.hf-footer__messages .hf-popover.is-open .hf-msg-popover')).toBeVisible()
    await expect(page.locator('.hf-msg-popover')).toContainText('Title')
  })
})
