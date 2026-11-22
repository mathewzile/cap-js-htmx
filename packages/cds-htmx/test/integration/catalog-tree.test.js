// A tree table in an Object Page (Catalogs -> topics, a hierarchy composition of a draft root), as the Fiori elements Manage Catalogs
// app does it: the tree is read within the object (its draft while it is edited), its nodes are edited in place (a patch changes ONE node),
// Create below a selected node makes it the parent, Cut/Paste moves a node in the draft, a node is not moved below its own node.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const FORM = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true }
const C = '40aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const id = n => `${n}aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
const [SCIENCE, PHYSICS, BIOLOGY, OPTICS, ARTS] = ['50', '51', '52', '53', '54'].map(id)
const root = active => `/htmx/admin/Catalogs(ID='${C}',IsActiveEntity=${active})`
const keyOf = n => `ID='${n}',IsActiveEntity=false`
const draftTopics = async () => (await api.GET(`/admin/Catalogs(ID=${C},IsActiveEntity=false)/topics?$select=ID,name,parent_ID`)).data.value
const nodesIn = html => [...String(html).matchAll(/data-hf-node="([^"]+)"[^>]*>/g)].map(m => m[1])

describe('a tree table in an Object Page (a composition that is a hierarchy)', () => {
  test('display mode: the page lists the top level and the open first level of the active tree', async () => {
    const page = String((await api.GET(root(true), { headers: HX })).data)
    assert.deepEqual(nodesIn(page).sort(), [SCIENCE, PHYSICS, BIOLOGY, ARTS].sort())
    assert.doesNotMatch(page, /name="name"/) // no inputs: nothing is edited
  })

  test('edit mode: the draft\'s tree with inputs; its nodes open through the section\'s own $children', async () => {
    assert.equal((await api.POST(`${root(true)}/$edit`, '', FORM)).status, 200)
    const page = String((await api.GET(root(false), { headers: HX })).data)
    assert.deepEqual(nodesIn(page).sort(), [SCIENCE, PHYSICS, BIOLOGY, ARTS].sort())
    assert.match(page, /name="name"/)
    const kids = String((await api.GET(`${root(false)}/topics/$children?node=${PHYSICS}&level=2&hq=TopicsHierarchy`, { headers: HX })).data)
    assert.deepEqual(nodesIn(kids), [OPTICS])
    assert.match(kids, /data-hf-level="2"/)
  })

  test('a change patches one node only', async () => {
    const r = await api.PATCH(`${root(false)}/topics(ID='${ARTS}',IsActiveEntity=false)/$field/name`, new URLSearchParams({ name: 'Arts and Crafts' }).toString(), FORM)
    assert.equal(r.status, 200)
    const names = Object.fromEntries((await draftTopics()).map(t => [t.ID, t.name]))
    assert.equal(names[ARTS], 'Arts and Crafts')
    assert.equal(names[SCIENCE], 'Science')
    assert.equal(names[PHYSICS], 'Physics')
  })

  test('the sub-page of a node has nothing to flush for its side effects: the request is answered, not a 404', async () => {
    const r = await api.POST(`${root(false)}/topics(ID='${ARTS}',IsActiveEntity=false)/$effects`, '', { ...FORM, headers: { ...FORM.headers, 'X-Htmx-Client': 'c1' } })
    assert.equal(r.status, 204)
  })

  test('Paste: a node moves below another one in the draft, only its parent changes', async () => {
    const r = await api.POST(`${root(false)}/topics/$move`, new URLSearchParams({ keys: keyOf(PHYSICS), parent: BIOLOGY }).toString(), FORM)
    assert.equal(r.status, 200)
    const parents = Object.fromEntries((await draftTopics()).map(t => [t.ID, t.parent_ID]))
    assert.equal(parents[PHYSICS], BIOLOGY)
    assert.equal(parents[BIOLOGY], SCIENCE)
    assert.equal(parents[OPTICS], PHYSICS)
    assert.equal(parents[SCIENCE], null)
  })

  test('a node is not moved below itself or one of its own nodes', async () => {
    const below = await api.POST(`${root(false)}/topics/$move`, new URLSearchParams({ keys: keyOf(SCIENCE), parent: OPTICS }).toString(), FORM)
    assert.equal(below.status, 409)
    const self = await api.POST(`${root(false)}/topics/$move`, new URLSearchParams({ keys: keyOf(SCIENCE), parent: SCIENCE }).toString(), FORM)
    assert.equal(self.status, 409)
    assert.equal((await draftTopics()).find(t => t.ID === SCIENCE).parent_ID, null)
  })

  test('Create with one node selected: the new node is its child, and its page opens', async () => {
    const res = await api.POST(`${root(false)}/topics`, new URLSearchParams({ keys: keyOf(ARTS) }).toString(), FORM)
    assert.equal(res.status, 200)
    const created = (await draftTopics()).find(t => !['50', '51', '52', '53', '54'].some(n => id(n) === t.ID))
    assert.equal(created.parent_ID, ARTS)
    assert.match(String(res.headers['hx-push-url']), /\/topics\(ID='[^']+',IsActiveEntity=false\)$/)
    // its name is mandatory: the draft cannot be saved without it
    const named = await api.PATCH(`${root(false)}/topics(ID='${created.ID}',IsActiveEntity=false)/$field/name`, new URLSearchParams({ name: 'Pottery' }).toString(), FORM)
    assert.equal(named.status, 200)
  })

  test('Delete removes the ticked node from the draft; Save activates all of it', async () => {
    const del = await api.POST(`${root(false)}/topics/$delete`, new URLSearchParams({ keys: keyOf(OPTICS) }).toString(), FORM)
    assert.equal(del.status, 200)
    assert.ok(!(await draftTopics()).some(t => t.ID === OPTICS))
    const saved = await api.POST(`${root(false)}/$save`, '', FORM)
    assert.equal(saved.status, 200)
    const active = (await api.GET(`/admin/Catalogs(ID=${C},IsActiveEntity=true)/topics?$select=ID,name,parent_ID`)).data.value
    assert.equal(active.find(t => t.ID === ARTS).name, 'Arts and Crafts')
    assert.equal(active.find(t => t.ID === PHYSICS).parent_ID, BIOLOGY)
    assert.ok(!active.some(t => t.ID === OPTICS))
    assert.equal(active.filter(t => t.parent_ID === ARTS).length, 1)
  })
})
