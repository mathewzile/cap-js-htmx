const { test } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

/** Screenshots of the real Fiori elements apps next to the htmx apps, same screens, light and dark, written to
 *  test-results/visual/<app>/<screen>-<theme>-{fe,htmx,diff}.png (diff: the two overlaid with blend mode "difference",
 *  black where they agree). Review output, not an assertion. Run with `npm run test:visual`; filter with -g "books light lr". */
const OUT = path.join(__dirname, '..', '..', '..', '..', 'test-results', 'visual')
const VIEWPORT = { width: 1440, height: 900 }

const APPS = {
  books: { fe: '/manage-books/webapp/index.html', htmx: '/manage-books-htmx/webapp/index.html', open: 'Jane Eyre', valueHelp: 'author_ID' },
  authors: { fe: '/manage-authors/webapp/index.html', htmx: '/manage-authors-htmx/webapp/index.html', open: 'Emily Brontë', valueHelp: null, dateField: 'dateOfBirth' }
}
const THEMES = { light: 'sap_horizon', dark: 'sap_horizon_dark' }

const fileOf = (app, name, theme, kind) => path.join(OUT, app, `${name}-${theme}-${kind}.png`)

/** Both apps share the database: drop the drafts a run leaves behind so the lists look the same next time. */
async function dropDrafts(request) {
  for (const [base, set] of [['/odata/v4/catalog', 'Books'], ['/admin', 'Authors']]) {
    const res = await request.get(`${base}/${set}?$filter=IsActiveEntity eq false&$select=ID`).catch(() => null)
    if (!res || !res.ok()) continue
    for (const d of (await res.json()).value || []) await request.delete(`${base}/${set}(ID=${d.ID},IsActiveEntity=false)`).catch(() => {})
  }
}

async function settle(page, kind) {
  if (kind === 'fe') {
    await page.waitForFunction(() => !document.querySelector('.sapUiLocalBusyIndicator, .sapMBusyIndicator'), null, { timeout: 15000 }).catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  await page.waitForTimeout(kind === 'fe' ? 800 : 500)
}

/** A screen that cannot be reached is logged and skipped, so the ones after it still get captured. */
const stepper = prefix => async (label, fn) => {
  try { await fn() } catch (e) { console.log(`${prefix} ${label}: ${e.message.split('\n').slice(0, 4).join(' ').slice(0, 300)}`) }
}

/** Closes the open dialog the way a user would: its Cancel button, else Escape. */
async function closeDialog(page) {
  const cancel = page.getByRole('button', { name: /^(Cancel|Close)$/ }).last()
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

// The Fiori controls of the two apps, by what a user sees; the FE ones are found by their stable id suffixes.
const ui = {
  fe: {
    ready: page => page.locator('tr.sapMLIB').first().waitFor({ timeout: 30000 }),
    variants: page => page.locator('[id$="vm-trigger"]'),
    adapt: page => page.locator('[id$="btnAdapt"]'),
    settings: page => page.locator('[id$="LineItem-settings"]'),
    create: page => page.locator('[id$="StandardAction::Create"]'),
    remove: page => page.locator('[id$="StandardAction::Delete"]'),
    firstHeader: page => page.locator('th.sapMListTblCell').first(),
    rowCheckbox: (page, n = 0) => page.locator('tr.sapMLIB .sapMCb').nth(n),
    filterHelp: (page, field) => page.locator(`[id$="FilterField::${field}-inner-vhi"]`),
    dateOpen: (page, field) => page.locator(`[id*="FilterField::${field}"] .sapUiIcon`).first(),
    dateItem: (page, text) => page.locator('.sapMPopover li', { hasText: text }).first(),
    openRow: (page, text) => page.locator('tr.sapMLIB', { hasText: text }).first().click({ position: { x: 150, y: 20 } }),
    // object page
    opReady: page => page.locator('[id$="StandardAction::Edit"], [id$="FooterBar::StandardAction::Save"]').first().waitFor({ timeout: 30000 }),
    edit: page => page.locator('[id$="StandardAction::Edit"]:visible').first(),
    opDelete: page => page.locator('[id$="ObjectPage--fe::StandardAction::Delete"], [id$="ObjectPage--fe::StandardAction::Delete-internalBtn"]').first(),
    draftMarker: page => page.locator('[id$="SwitchDraftAndActiveObject::_dt"]'),
    save: page => page.locator('[id$="FooterBar::StandardAction::Save"]'),
    discard: page => page.locator('[id$="FooterBar::StandardAction::Cancel"]'),
    messages: page => page.getByRole('button').filter({ hasText: /^\s*1\s*$/ }).last(),
    firstInput: page => page.locator('input[id*="FormElement::DataField"][id$="Field-edit-inner"]').first(),
    fieldHelp: page => page.locator('[id*="FormElement::DataField"][id$="Field-edit-inner-vhi"]').first(),
    subRow: page => page.locator('[id*="ObjectPage--fe::table"] tr.sapMLIB').first()
  },
  htmx: {
    ready: page => page.locator('#lr-table-body tr').first().waitFor({ timeout: 30000 }),
    variants: page => page.locator('[data-hf-popover-toggle]').first(),
    adapt: page => page.locator('[data-hf-action=adapt-filters]'),
    settings: page => page.locator('[data-hf-action=settings]'),
    create: page => page.locator('.hf-table-toolbar').getByRole('button', { name: 'Create' }),
    remove: page => page.locator('.hf-table-toolbar').getByRole('button', { name: 'Delete' }),
    firstHeader: page => page.locator('thead th[data-hf-sort]').first(),
    rowCheckbox: (page, n = 0) => page.locator('#lr-table-body .hf-checkbox').nth(n),
    filterHelp: (page, field) => page.locator(`[data-hf-filter="${field}"] .hf-input-group__addon button`),
    dateOpen: (page, field) => page.locator(`[data-hf-filter="${field}"] .hf-date-range__icon`),
    dateItem: (page, text) => page.locator('.hf-datepop__item', { hasText: text }).first(),
    openRow: (page, text) => page.locator('#lr-table-body tr', { hasText: text }).first().click(),
    // object page
    opReady: page => page.getByRole('button', { name: /^(Edit|Save)$/ }).first().waitFor({ timeout: 30000 }),
    edit: page => page.getByRole('button', { name: 'Edit', exact: true }).first(),
    opDelete: page => page.locator('#op-page').getByRole('button', { name: 'Delete' }).first(),
    draftMarker: page => page.locator('[data-hf-popover-toggle]').first(),
    save: page => page.getByRole('button', { name: 'Save', exact: true }),
    discard: page => page.getByRole('button', { name: 'Discard Draft' }),
    messages: page => page.getByRole('button').filter({ hasText: /^\s*1\s*$/ }).last(),
    firstInput: page => page.locator('[data-hf-field] input[type=text], [data-hf-field] input:not([type])').first(),
    fieldHelp: page => page.locator('[data-hf-field] button[aria-haspopup=dialog]').first(),
    subRow: page => page.locator('.hf-section--table tbody tr').first()
  }
}

/** Screens, grouped so one page load serves several. Each group is run once per kind ("fe" | "htmx"); `shot(name)` captures. */
const GROUPS = {
  async lr(kind, page, shot, app) {
    const u = ui[kind]
    const step = stepper(`${app} ${kind} lr`)
    await u.ready(page)
    await settle(page, kind)
    await shot('lr')

    await step('adapt-filters', async () => {
      await u.adapt(page).click()
      await settle(page, kind)
      await shot('lr-adapt-filters')
      await closeDialog(page)
    })

    if (APPS[app].valueHelp) await step('value-help', async () => {
      await u.filterHelp(page, APPS[app].valueHelp).click()
      await settle(page, kind)
      await shot('lr-value-help')
      await closeDialog(page)
    })

    if (APPS[app].dateField) await step('date-filter', async () => {
      await u.dateOpen(page, APPS[app].dateField).click()
      await settle(page, kind)
      await shot('lr-date-list')
      await u.dateItem(page, 'From / To').click()
      await settle(page, kind)
      await shot('lr-date-calendar')
      await page.keyboard.press('Escape')
      await page.locator('body').click({ position: { x: 700, y: 600 } })
    })

    await step('variants', async () => {
      await u.variants(page).click()
      await settle(page, kind)
      await shot('lr-variants')
      await page.keyboard.press('Escape')
    })

    await step('selected', async () => {
      await u.rowCheckbox(page, 1).click()
      await settle(page, kind)
      await shot('lr-selected')
    })

    await step('delete-confirm', async () => {
      await u.remove(page).click()
      await settle(page, kind)
      await shot('lr-delete-confirm')
      await closeDialog(page)
      await u.rowCheckbox(page, 1).click()
    })

    await step('settings', async () => {
      await u.settings(page).click()
      await settle(page, kind)
      await shot('lr-settings')
      await closeDialog(page)
    })

    await step('column-menu', async () => {
      await u.firstHeader(page).click()
      await settle(page, kind)
      await shot('lr-column-menu')
      await page.keyboard.press('Escape')
    })
  },

  async op(kind, page, shot, app) {
    const u = ui[kind]
    const step = stepper(`${app} ${kind} op`)
    await u.ready(page)
    await u.openRow(page, APPS[app].open)
    await u.opReady(page)
    await settle(page, kind)
    await shot('op')

    await step('delete', async () => {
      await u.opDelete(page).click()
      await settle(page, kind)
      await shot('op-delete-confirm')
      await closeDialog(page)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    })

    await step('sub-object', async () => {
      await u.subRow(page).click({ position: { x: 150, y: 10 } })
      await settle(page, kind)
      await page.waitForTimeout(1500)
      await shot('op-sub')
      await page.goBack()
      await u.opReady(page)
      await settle(page, kind)
    })

    await step('edit', async () => {
      await u.edit(page).click()
      await settle(page, kind)
      await shot('op-edit')
    })

    await step('draft-popover', async () => {
      await u.draftMarker(page).click()
      await settle(page, kind)
      await shot('op-draft-popover')
      await page.keyboard.press('Escape')
    })

    await step('field-help', async () => {
      await u.fieldHelp(page).click()
      await settle(page, kind)
      await shot('op-field-help')
      await closeDialog(page)
    })

    // FE discards an unchanged draft without asking, so change something first
    const original = await u.firstInput(page).inputValue().catch(() => '')
    await step('discard', async () => {
      await u.firstInput(page).fill(`${original} changed`)
      await u.firstInput(page).blur()
      await settle(page, kind)
      await u.discard(page).click()
      await settle(page, kind)
      await shot('op-discard-confirm')
      await closeDialog(page)
      await page.keyboard.press('Escape')
    })

    await step('save', async () => {
      await u.firstInput(page).fill(original)
      await u.firstInput(page).blur()
      await settle(page, kind)
      await u.save(page).click()
      await page.waitForTimeout(500)
      await shot('op-saved-toast')
      await page.waitForTimeout(3500)
    })

    await step('error', async () => {
      await u.edit(page).click()
      await settle(page, kind)
      const input = u.firstInput(page)
      await input.fill('')
      await input.blur()
      await u.save(page).click()
      await settle(page, kind)
      await shot('op-error')
      await u.messages(page).click()
      await settle(page, kind)
      await shot('op-error-messages')
      await page.keyboard.press('Escape')
    })
  }
}

async function writeDiff(browser, app, name, theme) {
  const img = kind => `data:image/png;base64,${fs.readFileSync(fileOf(app, name, theme, kind)).toString('base64')}`
  const page = await browser.newPage({ viewport: VIEWPORT })
  await page.setContent(`<body style="margin:0;background:#000"><div style="position:relative;width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;isolation:isolate">
    <img src="${img('fe')}" style="position:absolute;left:0;top:0"><img src="${img('htmx')}" style="position:absolute;left:0;top:0;mix-blend-mode:difference"></div>`)
  await page.screenshot({ path: fileOf(app, name, theme, 'diff') })
  await page.close()
}

for (const app of Object.keys(APPS)) {
  for (const theme of Object.keys(THEMES)) {
    for (const [group, run] of Object.entries(GROUPS)) {
      test(`${app} ${theme} ${group}`, async ({ browser, request }) => {
        fs.mkdirSync(path.join(OUT, app), { recursive: true })
        const names = new Set()
        await dropDrafts(request) // what an earlier run left
        try {
          for (const kind of ['fe', 'htmx']) {
            const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme, reducedMotion: 'reduce' })
            const page = await context.newPage()
            page.setDefaultTimeout(8000)
            const url = APPS[app][kind] + (kind === 'fe' ? `?sap-ui-theme=${THEMES[theme]}` : '')
            await page.goto(url)
            const shot = async name => {
              names.add(name)
              await page.screenshot({ path: fileOf(app, name, theme, kind) })
            }
            try { await run(kind, page, shot, app) } catch (e) { console.log(`${app} ${theme} ${group} ${kind}: ${e.message.split('\n')[0]}`) }
            await context.close()
            await dropDrafts(request)
          }
        } finally {
          for (const name of names) {
            if (fs.existsSync(fileOf(app, name, theme, 'fe')) && fs.existsSync(fileOf(app, name, theme, 'htmx'))) await writeDiff(browser, app, name, theme)
          }
        }
      })
    }
  }
}
