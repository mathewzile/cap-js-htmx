const { test, expect } = require('@playwright/test')

// A draft root (Catalogs) whose Object Page has a tree table (its composition Topics), in the launchpad sandbox: the htmx app next to the
// Fiori elements one (`app/manage-catalogs`, the reference: in edit mode the tree is read from the draft of the catalog and its rows are
// edited in place; Create below a selected node POSTs `<draft>/topics` with `parent@odata.bind` and opens the node's page; Delete
// DELETEs the node's draft; Cut/Paste PATCH the parent of the node's draft; Save activates it all together).

const FLP = '/flp-htmx/flpSandbox.html'
const CATALOG = '40aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const [SCIENCE, PHYSICS, BIOLOGY, OPTICS, ARTS] = ['50', '51', '52', '53', '54'].map(n => `${n}aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)
const START = { timeout: 120000 }

const row = (page, id) => page.locator(`.hf-section--table tbody tr[data-hf-node="${id}"]`)
const tick = (page, id) => row(page, id).locator('.hf-checkbox').check()
const hash = async page => decodeURIComponent(await page.evaluate(() => location.hash))
const activeTopics = async request => (await (await request.get(`/admin/Catalogs(ID=${CATALOG},IsActiveEntity=true)/topics?$select=ID,name,parent_ID`)).json()).value
const parentOf = (topics, id) => topics.find(t => t.ID === id)?.parent_ID

test.describe('a tree table in an Object Page (htmx Manage Catalogs)', () => {
  test.setTimeout(150000)

  test('display mode: the tree of the catalog, nodes open and close; edit mode: the same tree, edited in place, then saved', async ({ page, request }) => {
    await page.goto(`${FLP}#Catalogs-manageHtmx&/Catalogs(ID='${CATALOG}',IsActiveEntity=true)`)
    await expect(row(page, SCIENCE)).toBeVisible(START)
    // display: a tree (the first level is open), no Create
    await expect(row(page, PHYSICS)).toBeVisible()
    await expect(row(page, ARTS)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toHaveCount(0)
    await row(page, PHYSICS).locator('.hf-tree-toggle').click()
    await expect(row(page, OPTICS)).toBeVisible(START)

    // edit: the draft's tree, rows are inputs
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(row(page, ARTS).locator('input[name="name"]')).toBeVisible(START)
    await expect(row(page, PHYSICS).locator('.hf-tree-toggle')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cut', exact: true })).toBeDisabled()

    // a node is renamed in place
    await row(page, ARTS).locator('input[name="name"]').fill('Arts and Crafts')
    await row(page, ARTS).locator('input[name="name"]').blur()
    await expect(page.locator('.hf-field__message:not(:empty)')).toHaveCount(0)

    // Cut Physics, Paste below Biology (one node selected)
    await tick(page, PHYSICS)
    await page.getByRole('button', { name: 'Cut', exact: true }).click()
    await expect(row(page, PHYSICS)).toHaveClass(/hf-row--cut/)
    await tick(page, BIOLOGY)
    await page.getByRole('button', { name: 'Paste', exact: true }).click()
    await expect(row(page, ARTS).locator('input[name="name"]')).toHaveValue('Arts and Crafts', START) // the page came back with the draft's values
    await expect(row(page, PHYSICS)).toHaveCount(0) // Physics moved below Biology (collapsed)
    await row(page, BIOLOGY).locator('.hf-tree-toggle').click()
    await expect(row(page, PHYSICS)).toBeVisible(START)

    // Create below Arts: the new node's page opens with Arts as the parent
    await tick(page, ARTS)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect.poll(() => hash(page), START).toMatch(/\/topics\(ID='[^']+',IsActiveEntity=false\)$/)
    await expect(page.locator('.hf-page--op')).toBeVisible(START)
    await page.locator('input[name="name"]').first().fill('Pottery')
    await page.locator('input[name="name"]').first().blur()
    await page.waitForTimeout(800)
    await page.goBack()
    await expect(row(page, ARTS)).toBeVisible(START)
    // (the path to the new node is open)
    await expect(page.locator('.hf-section--table tbody tr input[value="Pottery"]')).toBeVisible(START)

    // Delete Optics (it is below Physics, which is below Biology: both closed again after the page came back)
    await row(page, BIOLOGY).locator('.hf-tree-toggle').click()
    await expect(row(page, PHYSICS)).toBeVisible(START)
    await row(page, PHYSICS).locator('.hf-tree-toggle').click()
    await expect(row(page, OPTICS)).toBeVisible(START)
    await tick(page, OPTICS)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.locator('.hf-message-box').getByRole('button', { name: 'Delete' }).click()
    await expect(row(page, OPTICS)).toHaveCount(0, START)

    // nothing is saved yet
    let active = await activeTopics(request)
    expect(active.find(t => t.ID === ARTS).name).toBe('Arts')
    expect(parentOf(active, PHYSICS)).toBe(SCIENCE)
    expect(active.some(t => t.ID === OPTICS)).toBe(true)

    // Save activates the draft: the rename, the move, the new node and the deletion
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible(START)
    active = await activeTopics(request)
    expect(active.find(t => t.ID === ARTS).name).toBe('Arts and Crafts')
    expect(parentOf(active, PHYSICS)).toBe(BIOLOGY)
    expect(active.some(t => t.ID === OPTICS)).toBe(false)
    const pottery = active.find(t => t.name === 'Pottery')
    expect(pottery?.parent_ID).toBe(ARTS)
  })

  test('a node is not pasted below itself or one of its own nodes', async ({ page }) => {
    await page.goto(`${FLP}#Catalogs-manageHtmx&/Catalogs(ID='${CATALOG}',IsActiveEntity=true)`)
    await expect(row(page, SCIENCE)).toBeVisible(START)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(row(page, ARTS).locator('input[name="name"]')).toBeVisible(START)
    await tick(page, SCIENCE)
    await page.getByRole('button', { name: 'Cut', exact: true }).click()
    await tick(page, BIOLOGY) // a node of Science (the other test moved Physics below it)
    await page.getByRole('button', { name: 'Paste', exact: true }).click()
    // as in Fiori elements nothing happens: no message, no request, the paste mode ends and the tree is as it was
    await expect(row(page, SCIENCE)).not.toHaveClass(/hf-row--cut/)
    await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeDisabled()
    await expect(page.locator('.hf-message-strip, .hf-toast, [role="alert"]').filter({ hasText: /itself|own|descendant|Cannot/i })).toHaveCount(0)
    await expect(row(page, SCIENCE)).toHaveAttribute('data-hf-level', /^[01]$/)
    await page.getByRole('button', { name: 'Discard Draft' }).click()
  })
})

test.describe('deleting a node that has nodes below it (htmx Manage Catalogs)', () => {
  test.setTimeout(150000)

  // Fiori elements (observed): one `DELETE <draft>/topics(<node>)` for the selected node; the nodes below it go with it (the children are a composition)
  test('the whole subtree of the node is gone from the draft', async ({ page, request }) => {
    await page.goto(`${FLP}#Catalogs-manageHtmx&/Catalogs(ID='${CATALOG}',IsActiveEntity=true)`)
    await expect(row(page, SCIENCE)).toBeVisible(START)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(row(page, ARTS).locator('input[name="name"]')).toBeVisible(START)
    await tick(page, SCIENCE)
    const deletes = []
    page.on('request', r => { if (r.method() === 'DELETE' || /\$delete/.test(r.url())) deletes.push(r.url()) })
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.locator('.hf-message-box').getByRole('button', { name: 'Delete' }).click()
    await expect(row(page, SCIENCE)).toHaveCount(0, START)
    const draft = (await (await request.get(`/admin/Catalogs(ID=${CATALOG},IsActiveEntity=false)/topics?$select=ID`)).json()).value.map(t => t.ID)
    for (const gone of [SCIENCE, PHYSICS, BIOLOGY, OPTICS]) expect(draft).not.toContain(gone)
    expect(draft).toContain(ARTS)
    expect(deletes.length).toBe(1) // one request for the node, not one per descendant
    await page.getByRole('button', { name: 'Discard Draft' }).click()
  })
})
