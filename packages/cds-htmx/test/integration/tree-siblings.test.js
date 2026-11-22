// Ordering the nodes of a tree table (Hierarchy.RecursiveHierarchyActions.ChangeNextSiblingAction of the Categories sample): Move Up / Move Down
// and a drop between two nodes send `$move` with `next` (the sibling the node is put before, empty: last), which calls the annotated action.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const treeEdit = require('../../lib/data/tree-edit')

const HX = { 'HX-Request': 'true' }
const FORM = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true }
const id = n => `${n}aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
const [FICTION, DRAMA, MYSTERY, NONFICTION, BIOGRAPHY, SCIENCE, REFERENCE] = ['30', '31', '32', '34', '35', '36', '37'].map(id)
const keyOf = n => `ID='${n}',IsActiveEntity=true`
const place = (node, parent, next) => api.POST('/htmx/admin/Categories/$move', new URLSearchParams({ keys: keyOf(node), parent, next }).toString(), FORM)
const order = async parent => (await cds.services.AdminService.tx(tx => tx.run(SELECT.from('AdminService.Categories').columns('ID', 'rank')
  .where(parent ? { parent_ID: parent, IsActiveEntity: true } : { parent_ID: null, IsActiveEntity: true }).orderBy('rank')))).map(r => r.ID)
const rowsIn = html => [...String(html).matchAll(/data-hf-level="0"[^>]*data-hf-node="([^"]+)"/g)].map(m => m[1])

describe('tree table: order the nodes among their siblings', () => {
  test('the model reads the action and the root setting from Hierarchy.RecursiveHierarchyActions', () => {
    const { buildHierarchy } = require('../../lib/model/hierarchy')
    const cache = require('../../lib/model/cache')
    const store = cache.storeFor(cds.model, 'AdminService', '/admin/', { appRoot: path.join(__dirname, '..', '..', '..', '..', 'app') })
    const h = buildHierarchy(store, 'AdminService.Categories', 'CategoriesHierarchy', 0)
    assert.equal(h.siblingAction, 'AdminService.Categories.changeNextSibling')
    assert.equal(h.rootSiblings, undefined) // not fixed
  })

  test('the List Report lists the nodes in rank order and offers Move Up / Move Down', async () => {
    const page = String((await api.GET('/htmx/admin/Categories', { headers: HX })).data)
    assert.deepEqual(rowsIn(page).slice(0, 3), [FICTION, NONFICTION, REFERENCE])
    assert.match(page, /data-hf-tree-sibling="up"/)
    assert.match(page, /data-hf-tree-sibling="down"/)
  })

  test('a node is put before a sibling', async () => {
    const res = await place(REFERENCE, '', NONFICTION); if (res.status !== 200) console.log('DEBUG', res.status, String(res.data).slice(0, 600))
    assert.equal(res.status, 200)
    assert.deepEqual(await order(null), [FICTION, REFERENCE, NONFICTION])
    assert.deepEqual(rowsIn(res.data).slice(0, 3), [FICTION, REFERENCE, NONFICTION])
  })

  test('an empty sibling puts it last (Move Down of the last but one)', async () => {
    assert.equal((await place(FICTION, '', '')).status, 200)
    assert.deepEqual(await order(null), [REFERENCE, NONFICTION, FICTION])
  })

  test('a node below another parent is ordered there: it is moved first, then put before the sibling', async () => {
    assert.equal((await place(DRAMA, NONFICTION, SCIENCE)).status, 200)
    assert.deepEqual(await order(NONFICTION), [BIOGRAPHY, DRAMA, SCIENCE])
    assert.equal((await place(MYSTERY, NONFICTION, '')).status, 200)
    assert.deepEqual((await order(NONFICTION)).slice(-1), [MYSTERY])
  })

  test('a node is not put before something that is no sibling of its parent', async () => {
    const res = await place(REFERENCE, '', BIOGRAPHY) // Biography is a child of Non-Fiction
    assert.equal(res.status, 404)
  })

  test('the order of the top-level nodes can be fixed (ChangeSiblingForRootsSupported)', async () => {
    const tx = cds.services.AdminService
    await assert.rejects(tx.tx(t => treeEdit.reorder(t, 'AdminService.Categories', { nodeProperty: 'ID', parentKey: 'parent_ID', siblingAction: 'AdminService.Categories.changeNextSibling', rootSiblings: false }, { ID: REFERENCE, IsActiveEntity: true }, NONFICTION)), { code: 'ROOTS_FIXED' })
  })

  test('deleting a node takes every node below it with it (the children are a composition), the rest stays', async () => {
    // Non-Fiction now has Biography, Science, Drama, Mystery and (below Mystery) Cozy Mystery
    const COZY = id('33')
    const res = await api.POST('/htmx/admin/Categories/$delete', new URLSearchParams({ keys: keyOf(NONFICTION) }).toString(), FORM)
    assert.equal(res.status, 200)
    const left = (await cds.services.AdminService.tx(tx => tx.run(SELECT.from('AdminService.Categories').columns('ID').where({ IsActiveEntity: true })))).map(r => r.ID)
    for (const gone of [NONFICTION, BIOGRAPHY, SCIENCE, DRAMA, MYSTERY, COZY]) assert.ok(!left.includes(gone), gone + ' is deleted')
    assert.ok(left.includes(FICTION) && left.includes(REFERENCE))
    assert.doesNotMatch(String(res.data), new RegExp('data-hf-node="' + NONFICTION + '"'))
  })
})
