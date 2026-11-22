const { test, expect } = require('@playwright/test')

// Intent-based navigation between apps in the local launchpad sandbox (`app/flp-htmx`: the htmx apps and the Fiori elements ones side by side).
// Source side: the button of a book's page passes the page's values. Target side: the app applies them like Fiori elements does --
//   a filter field filters the List Report; the semantic key (title) opens the Object Page; the technical key alone only filters.
// The sandbox loads UI5 from the CDN and starts an app in 15-30 s the first time, hence the long timeouts.

const FLP = '/flp-htmx/flpSandbox.html'
const EMILY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001'
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000001' // Wuthering Heights, by Emily Brontë
const JANE_EYRE = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002'
const START = { timeout: 120000 }

const rows = page => page.locator('.hf-table tbody tr')
const hash = async page => decodeURIComponent(await page.evaluate(() => location.hash))

test.describe('an htmx app started with parameters (target side)', () => {
  test.setTimeout(240000)

  test('a parameter that is a filter field filters the List Report', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?author_ID=${EMILY}`)
    await expect(rows(page).first()).toBeVisible(START)
    const texts = await rows(page).allInnerTexts()
    expect(texts.length).toBeGreaterThan(1)
    for (const text of texts) expect(text).toContain('Emily Brontë')
    await expect(page.locator(`[name="f.author_ID"]`).first()).toHaveValue(EMILY)
    // the route is kept in the hash, so a reload opens the same page
    expect(await hash(page)).toContain(`&/Books?f.author_ID=${EMILY}`)
  })

  test('the semantic key opens the Object Page, and an unknown parameter is ignored', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?title=Jane%20Eyre&unknownThing=1`)
    await expect(page.locator('.hf-page--op')).toBeVisible(START)
    await expect(page.locator('.hf-page--op')).toContainText('Jane Eyre')
    expect(await hash(page)).toContain(`&/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
  })

  test('the full technical key, IsActiveEntity included, opens the Object Page (as in Fiori elements)', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?ID=${JANE_EYRE}&IsActiveEntity=true`)
    await expect(page.locator('.hf-page--op')).toBeVisible(START)
    await expect(page.locator('.hf-page--op')).toContainText('Jane Eyre', START)
    expect(await hash(page)).toContain(`&/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
  })

  test('the technical key alone only filters: the List Report stays with that one row', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?ID=${JANE_EYRE}`)
    await expect(rows(page)).toHaveCount(1, START)
    await expect(rows(page).first()).toContainText('Jane Eyre')
    await expect(page.locator('.hf-page--op')).toHaveCount(0)
  })

  test('a reload keeps the page the parameters led to', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?title=Jane%20Eyre`)
    await expect(page.locator('.hf-page--op')).toBeVisible(START)
    await page.reload()
    await expect(page.locator('.hf-page--op')).toBeVisible(START)
    await expect(page.locator('.hf-page--op')).toContainText('Jane Eyre')
  })
})

test.describe('the intent button of a book page, from either kind of app to the htmx Books app', () => {
  test.setTimeout(300000)

  test('htmx Authors -> htmx Books: the page passes its values and the target opens the book', async ({ page, request }) => {
    // other specs change the stock of this book: the page passes what it has now
    const { stock } = await (await request.get(`/odata/v4/catalog/Books(${BOOK})?$select=stock`)).json()
    await page.goto(`${FLP}#Authors-manageHtmx&/Authors(ID=${EMILY},IsActiveEntity=true)/books(ID=${BOOK})`)
    await page.getByText('Open Manage Books (HTMX)', { exact: true }).first().click(START)
    await expect.poll(() => hash(page), START).toContain('#Books-manageHtmx?') // the Authors columns are gone once the other app is open
    await expect(page.locator('.hf-page--op')).toHaveCount(1, START)
    await expect(page.locator('.hf-page--op')).toContainText('Wuthering Heights', START)
    const url = await hash(page)
    expect(url).toContain('#Books-manageHtmx?')
    expect(url).toMatch(new RegExp(`[?&]ID=${BOOK}`)) // (the launchpad sorts the parameters by name)
    // (the launchpad encodes the space of the title twice in the hash, for a Fiori elements source as well)
    for (const part of ['price=11.50', 'rating=4.5', `stock=${stock}`, 'title=Wuthering%20Heights']) expect(url).toContain(part)
    expect(url).not.toMatch(/descr=|author_ID=|IsActiveEntity=true&/)
  })

  test('Fiori elements Authors -> htmx Books: the same click, the same target page', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manage&/Authors(ID=${EMILY},IsActiveEntity=true)`)
    await page.getByText('Wuthering Heights').first().click(START)
    // the section has two actions now: Fiori elements puts them in the "..." menu of the section's heading
    await page.locator('button[id$="Authors_booksObjectPage--fe::FacetSubSection::General-_headerToolbar-overflowButton"]').first().click(START)
    await page.getByText('Open Manage Books (HTMX)', { exact: true }).first().click(START)
    await expect.poll(() => hash(page), START).toContain('#Books-manageHtmx?')
    await expect(page.locator('.hf-page--op')).toHaveCount(1, START)
    await expect(page.locator('.hf-page--op')).toContainText('Wuthering Heights', START)
  })
})

test.describe('the other intent forms, in the htmx Authors app', () => {
  test.setTimeout(300000)

  test('the name in the list is a link: the htmx Books app opens with that author as the filter', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx`)
    await page.getByRole('link', { name: 'Emily Brontë' }).first().click(START)
    await expect.poll(() => hash(page), START).toContain('#Books-manageHtmx?')
    expect(await hash(page)).toContain(`author_ID=${EMILY}`)
    // (the hash changes before the Books page is in: wait for its filter, or the rows read are still the Authors')
    await expect(page.locator('[name="f.author_ID"]').first()).toHaveValue(EMILY, START)
    await expect(rows(page).first()).toBeVisible(START)
    for (const text of await rows(page).allInnerTexts()) expect(text).toContain('Emily Brontë')
  })

  test('the intent buttons sit before Create and Delete, as in Fiori elements', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx`)
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible(START)
    const names = () => page.locator('.hf-table-toolbar button:visible').evaluateAll(bs => bs.map(b => b.textContent.trim()).filter(Boolean).slice(0, 4))
    // ("Show Reviews" has no target in the launchpad and goes once that is known)
    await expect.poll(names).toEqual(['Show Books (HTMX)', 'Show Books', 'Create', 'Delete'])
  })

  test('the toolbar button needs one selected author, then opens the Fiori elements Books app filtered by it', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx`)
    const button = page.getByRole('button', { name: 'Show Books', exact: true })
    await expect(button).toBeDisabled(START)
    await page.locator('.hf-table tbody tr', { hasText: 'Emily Brontë' }).locator('.hf-checkbox').check()
    await expect(button).toBeEnabled()
    // the Fiori elements target moves the parameters into its own app state (not the hash): what the shell was asked for is the check
    await page.evaluate(() => { const a = window.HtmxShell.adapter; const go = a.navigate.bind(a); window.sent = []; a.navigate = async args => { window.sent.push(args); return go(args) } })
    await button.click()
    await expect.poll(() => hash(page), START).toContain('#Books-manage?')
    const [sent] = await page.evaluate(() => window.sent)
    expect(sent).toMatchObject({ semanticObject: 'Books', action: 'manage', params: { author_ID: EMILY } })
  })

  test('the name on the author page links to the one other target at once (the open app is not offered, as in Fiori elements)', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx&/Authors(ID=${EMILY},IsActiveEntity=true)`)
    await page.locator('.hf-page--op .hf-semantic-link', { hasText: 'Emily Brontë' }).click(START)
    await expect.poll(() => hash(page), START).toContain('#Authors-manage?')
  })

  test('the author name on a book page of the htmx Books app: its popover offers both Authors apps', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx&/Books(ID='${BOOK}',IsActiveEntity=true)`)
    await page.locator('.hf-page--op .hf-semantic-link', { hasText: 'Emily Brontë' }).click(START)
    const items = page.locator('.hf-semantic-popover').getByRole('menuitem')
    await expect(items).toHaveCount(2, START)
    await expect(items).toHaveText(['Manage Authors', 'Manage Authors (htmx)'])
    await items.nth(1).click()
    await expect.poll(() => hash(page), START).toContain('#Authors-manageHtmx')
  })

  test('a book page has both buttons: "Open Manage Books" goes to the Fiori elements app with the book\'s values', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx&/Authors(ID=${EMILY},IsActiveEntity=true)/books(ID=${BOOK})`)
    await expect(page.getByText('Open Manage Books (HTMX)', { exact: true })).toBeVisible(START)
    await page.getByText('Open Manage Books', { exact: true }).first().click(START)
    await expect.poll(() => hash(page), START).toContain('#Books-manage?')
    expect(await hash(page)).toContain(`ID=${BOOK}`)
  })
})

test.describe('app state, path-prefixed parameters and supported targets', () => {
  test.setTimeout(300000)

  test('htmx Authors -> htmx Books also passes the context as an app state, and the path-prefixed copies of a page below another one', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx&/Authors(ID=${EMILY},IsActiveEntity=true)/books(ID=${BOOK})`)
    await page.getByText('Open Manage Books (HTMX)', { exact: true }).first().click(START)
    await expect.poll(() => hash(page), START).toContain('#Books-manageHtmx?')
    const url = await hash(page)
    expect(url).toMatch(/sap-xapp-state=\w+/)
    expect(url).toContain(`Authors.books.ID=${BOOK}`)
    expect(url).toContain('Authors.books.title=Wuthering%20Heights')
  })

  test('an app started with only an app state (a SelectionVariant) applies its values like parameters of the URL', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx`)
    await expect(rows(page).first()).toBeVisible(START)
    const key = await page.evaluate(async author => {
      const AppState = await sap.ushell.Container.getServiceAsync('AppState')
      const Component = await new Promise(resolve => sap.ui.require(['sap/ui/core/Component'], resolve))
      const component = Object.values(Component.registry.all()).find(c => c.getMetadata().getName().includes('htmx'))
      const state = AppState.createEmptyAppState(component)
      state.setData({ selectionVariant: JSON.stringify({ SelectionVariantID: '', Parameters: [], SelectOptions: [{ PropertyName: 'author_ID', Ranges: [{ Sign: 'I', Option: 'EQ', Low: author, High: null }] }] }) })
      await state.save()
      return state.getKey()
    }, EMILY)
    await page.evaluate(key => { location.hash = `#Books-manageHtmx?sap-xapp-state=${key}` }, key)
    await expect.poll(() => hash(page), START).toContain('#Books-manageHtmx')
    await expect(page.locator(`[name="f.author_ID"]`).first()).toHaveValue(EMILY, START)
    for (const text of await rows(page).allInnerTexts()) expect(text).toContain('Emily Brontë')
  })

  test('Authors-manage has an intent no tile serves ("Show Reviews"): the htmx app hides it like the FE app does, from the first page on', async ({ page }) => {
    for (const app of ['Authors-manage', 'Authors-manageHtmx']) {
      await page.goto(`${FLP}#${app}`)
      await expect(page.getByRole('button', { name: 'Show Books', exact: true })).toBeVisible(START)
      await expect(page.getByRole('button', { name: 'Show Reviews' }).filter({ visible: true })).toHaveCount(0, { timeout: 15000 })
    }
  })
})

test.describe('a second navigation, and a page outside a launchpad', () => {
  test.setTimeout(300000)

  test('an intent into the htmx app that is already open starts it again with the new parameters', async ({ page }) => {
    await page.goto(`${FLP}#Books-manageHtmx?author_ID=${EMILY}`)
    await expect(page.locator('[name="f.author_ID"]').first()).toHaveValue(EMILY, START)
    await page.evaluate(() => { location.hash = '#Books-manageHtmx?title=Jane%20Eyre' })
    await expect(page.locator('.hf-page--op')).toContainText('Jane Eyre', START)
    expect(await hash(page)).toContain(`&/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
  })

  test('outside a launchpad nothing is known about targets: the button stays and the click says it needs one', async ({ page }) => {
    await page.goto('/htmx/admin/Authors')
    const button = page.getByRole('button', { name: 'Show Books', exact: true })
    await expect(button).toBeVisible(START)
    await page.locator('.hf-table tbody tr', { hasText: 'Emily Brontë' }).locator('.hf-checkbox').check()
    await button.click()
    await expect(page.getByRole('alert')).toContainText('only possible in an SAP Fiori launchpad')
  })
})

test.describe('htmx app -> Fiori elements app (what the FE target does with what the htmx source sends)', () => {
  test.setTimeout(300000)
  const feRows = page => page.locator('tbody tr', { hasText: 'Object Status' })

  test('the toolbar button of the htmx Authors list: the FE Books List Report is filtered by the selected author', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx`)
    await page.locator('.hf-table tbody tr', { hasText: 'Emily Brontë' }).locator('.hf-checkbox').check(START)
    await page.getByRole('button', { name: 'Show Books', exact: true }).click()
    await expect.poll(() => hash(page), START).toContain('#Books-manage?author_ID=' + EMILY)
    expect(await hash(page)).toMatch(/sap-xapp-state=\w+/)
    await expect(feRows(page).first()).toBeVisible(START)
    const texts = await feRows(page).allInnerTexts()
    expect(texts.length).toBeGreaterThan(1)
    for (const text of texts) expect(text).toContain('Emily Brontë')
  })

  test('the button of an htmx book page: the FE Books app opens that book (the semantic key leads to its Object Page)', async ({ page }) => {
    await page.goto(`${FLP}#Authors-manageHtmx&/Authors(ID=${EMILY},IsActiveEntity=true)/books(ID=${BOOK})`)
    await page.getByText('Open Manage Books', { exact: true }).first().click(START)
    await expect.poll(() => hash(page), START).toContain("&/Books('Wuthering%20Heights')")
    await expect(page.getByText('A classic novel of passion and revenge').first()).toBeVisible(START)
  })
})
