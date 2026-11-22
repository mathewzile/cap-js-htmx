// Editing a tree table (draft-enabled Categories), compared with the Fiori elements Manage Categories sample:
//   Create with a node selected  -> POST Categories {"parent@odata.bind": <selected>} : a draft that is the child of that node
//   Cut / Paste                  -> PATCH Categories(ID=<node>,IsActiveEntity=true) {"parent@odata.bind": <new parent>} : the active entity
//   a move below the node itself or a descendant is not done
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const treeEdit = require('../../lib/data/tree-edit')

const HX = { 'HX-Request': 'true' }
const FORM = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true }
const FICTION = '30aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DRAMA = '31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MYSTERY = '32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COZY = '33aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const NONFICTION = '34aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BIOGRAPHY = '35aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const keyOf = id => `ID='${id}',IsActiveEntity=true`
const move = (id, parent) => api.POST('/htmx/admin/Categories/$move', new URLSearchParams({ keys: keyOf(id), parent }).toString(), FORM)
const parentOf = async id => (await cds.services.AdminService.tx(tx => tx.run(SELECT.one.from('AdminService.Categories').columns('parent_ID').where({ ID: id, IsActiveEntity: true })))).parent_ID

describe('tree table editing: move a node (Cut and Paste)', () => {
  test('a node moves below another one: its parent is updated on the active entity', async () => {
    assert.equal(await parentOf(DRAMA), FICTION)
    const res = await move(DRAMA, NONFICTION)
    assert.equal(res.status, 200)
    assert.equal(await parentOf(DRAMA), NONFICTION)
  })

  test('the List Report that comes back has the path to the moved node open, so it shows where it went', async () => {
    const res = await move(COZY, BIOGRAPHY) // Cozy Mystery was below Mystery, below Fiction; Biography is below Non-Fiction
    const page = String(res.data)
    const row = id => new RegExp(`<tr[^>]*data-hf-node="${id}"[^>]*>`).exec(page)?.[0] ?? ''
    assert.match(row(COZY), /data-hf-level="2"/, 'Cozy Mystery is shown, two levels down')
    assert.match(row(BIOGRAPHY), /data-hf-state="expanded"/, 'its new parent is open')
    assert.match(row(NONFICTION), /data-hf-state="expanded"/, 'and the nodes above it')
    assert.equal(await parentOf(COZY), BIOGRAPHY)
  })

  test('an empty parent moves the node to the top level', async () => {
    assert.equal((await move(COZY, '')).status, 200)
    assert.equal(await parentOf(COZY), null)
  })

  test('a move below the node itself or one of its descendants is refused, and nothing changes', async () => {
    const own = await move(FICTION, FICTION)
    assert.equal(own.status, 409)
    assert.match(String(own.data), /cannot be moved below itself/)
    const below = await move(NONFICTION, BIOGRAPHY) // Biography is a child of Non-Fiction (Drama also moved there above)
    assert.equal(below.status, 409)
    assert.equal(await parentOf(BIOGRAPHY), NONFICTION)
    assert.equal(await parentOf(NONFICTION), null)
  })

  test('a parent that does not exist, a node that does not exist and a bad request are refused', async () => {
    assert.equal((await move(MYSTERY, '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status, 404)
    assert.equal((await move('99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', FICTION)).status, 404)
    assert.equal((await api.POST('/htmx/admin/Categories/$move', new URLSearchParams({ parent: FICTION }).toString(), FORM)).status, 400)
  })

  test('a set that is no tree has no move', async () => {
    assert.equal((await api.POST('/htmx/admin/Authors/$move', new URLSearchParams({ keys: "ID='x'", parent: '' }).toString(), FORM)).status, 404)
  })
})

describe('tree table editing: Create below the selected node', () => {
  const create = body => api.POST('/htmx/admin/Categories', body, FORM)
  const draftsOf = parent => cds.services.AdminService.tx(tx => tx.run(SELECT.from('AdminService.Categories').columns('ID', 'parent_ID').where({ IsActiveEntity: false, parent_ID: parent })))

  test('one node selected: the new draft is its child, and its page opens', async () => {
    const res = await create(new URLSearchParams({ keys: keyOf(MYSTERY) }).toString())
    assert.equal(res.status, 200)
    assert.match(String(res.data), /hf-page--op/)
    const drafts = await draftsOf(MYSTERY)
    assert.equal(drafts.length, 1)
    await api.POST(`/htmx/admin/Categories(ID='${drafts[0].ID}',IsActiveEntity=false)/$discard`, {}, { headers: HX })
  })

  test('nothing selected: a node of the top level (as before)', async () => {
    const res = await create('')
    assert.equal(res.status, 200)
    const drafts = await draftsOf(null)
    assert.equal(drafts.length, 1)
    await api.POST(`/htmx/admin/Categories(ID='${drafts[0].ID}',IsActiveEntity=false)/$discard`, {}, { headers: HX })
  })

  test('several nodes selected: no parent is guessed', async () => {
    const res = await create(new URLSearchParams([['keys', keyOf(MYSTERY)], ['keys', keyOf(DRAMA)]]).toString())
    assert.equal(res.status, 200)
    const [draft] = await draftsOf(null)
    assert.ok(draft, 'a top-level draft')
    await api.POST(`/htmx/admin/Categories(ID='${draft.ID}',IsActiveEntity=false)/$discard`, {}, { headers: HX })
  })
})

describe('data/tree-edit moveNode (the cycle check)', () => {
  const hierarchy = { nodeProperty: 'ID', parentKey: 'parent_ID' }
  test('MoveError carries the reason', () => {
    const err = new treeEdit.MoveError('CYCLE')
    assert.equal(err.code, 'CYCLE')
    assert.ok(err instanceof Error)
  })
  test('ancestorsOf walks up to the top, nearest first', async () => {
    const chain = await cds.services.AdminService.tx(tx => treeEdit.ancestorsOf(tx, 'AdminService.Categories', hierarchy, COZY))
    // earlier tests moved Cozy Mystery to the top level
    assert.deepEqual(chain, [])
    const drama = await cds.services.AdminService.tx(tx => treeEdit.ancestorsOf(tx, 'AdminService.Categories', hierarchy, DRAMA))
    assert.deepEqual(drama, [NONFICTION])
  })
})

describe('tree table and drafts (as Fiori elements: the tree lists the active nodes only)', () => {
  test('a draft child does not show in the List Report tree, and the node it is below stays as it was', async () => {
    const res = await api.POST('/htmx/admin/Categories', new URLSearchParams({ keys: keyOf(NONFICTION) }).toString(), FORM)
    assert.equal(res.status, 200)
    const [draft] = await cds.services.AdminService.tx(tx => tx.run(SELECT.from('AdminService.Categories').columns('ID').where({ IsActiveEntity: false, parent_ID: NONFICTION })))
    const list = await api.GET('/htmx/admin/Categories', { headers: HX })
    assert.ok(!String(list.data).includes(`data-hf-node="${draft.ID}"`), 'the draft is not a row')
    await api.POST(`/htmx/admin/Categories(ID='${draft.ID}',IsActiveEntity=false)/$discard`, {}, { headers: HX })
  })
})

describe('deleting from a tree (a draft root with a hierarchy)', () => {
  const exists = id => cds.services.AdminService.tx(tx => tx.run(SELECT.one.from('AdminService.Categories').columns('ID').where({ ID: id, IsActiveEntity: true })))

  test('POST /$delete of a node works: CAP reads the key from the path of the DELETE (it was "Deletion not supported")', async () => {
    assert.ok(await exists(COZY))
    const res = await api.POST('/htmx/admin/Categories/$delete', new URLSearchParams({ keys: keyOf(COZY) }).toString(), FORM)
    assert.equal(res.status, 200)
    assert.doesNotMatch(String(res.data), /Deletion not supported/)
    assert.equal(await exists(COZY), undefined)
  })
})
