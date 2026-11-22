// A draft that somebody else holds, seen by a second user: the saved version's Object Page header says who (an icon with a popover: "This object has unsaved changes made by <user>", as Fiori
// elements does) and offers no switch to a draft that is not theirs; the holder sees "Saved Version" with the popover to get back to it.
// Edit on that object is refused with the holder's name.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const EMILY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001'
const as = (username, extra = {}) => ({ auth: { username, password: '' }, headers: { ...HX, ...extra }, validateStatus: () => true })
const active = `/htmx/admin/Authors(ID=${EMILY},IsActiveEntity=true)`

describe('a draft held by another user', () => {
  test('alice starts editing the author', async () => {
    const res = await api.POST(`${active}/$edit`, '', as('alice', { 'Content-Type': 'application/x-www-form-urlencoded' }))
    assert.equal(res.status, 200)
  })

  test("bob sees the saved version with who holds the draft, and no switch to alice's draft", async () => {
    const page = String((await api.GET(active, as('bob'))).data)
    assert.match(page, /unsaved changes made by alice/)
    assert.doesNotMatch(page, /data-hf-popover-toggle[^>]*>\s*Saved Version/)
  })

  test("the List Report's draft owners are found for a user who cannot read the draft through the service", async () => {
    const queryLib = require('../../lib/data/query')
    const marked = async user => {
      const row = { ID: EMILY, IsActiveEntity: true, HasDraftEntity: true }
      await cds.services.AdminService.tx({ user: new cds.User({ id: user }) }, tx => queryLib.markDraftOwners(tx, 'AdminService.Authors', { semanticKey: ['name'] }, [row], user))
      return row
    }
    assert.deepEqual(await marked('bob').then(r => [r._draftOwn, r._lockedBy]), [false, 'alice'])
    assert.deepEqual(await marked('alice').then(r => [r._draftOwn, r._lockedBy]), [true, null])
  })

  test('alice sees her own draft marker with the way back to the saved version', async () => {
    const page = String((await api.GET(active, as('alice'))).data)
    assert.doesNotMatch(page, /unsaved changes made by/)
    assert.match(page, /Saved Version/)
  })

  test('bob cannot take the draft over: Edit is refused and names alice', async () => {
    const res = await api.POST(`${active}/$edit`, '', as('bob', { 'Content-Type': 'application/x-www-form-urlencoded' }))
    assert.equal(res.status, 409)
    assert.match(String(res.data), /alice/)
  })
})
