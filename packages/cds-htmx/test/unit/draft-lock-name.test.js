const assert = require('node:assert/strict')
const { test } = require('node:test')
const { draftStatusBadge } = require('../../lib/render/table')

const bundle = { LockedByAnotherUser: 'Locked by Another User', LockedByUser: 'Locked by {0}', Draft: 'Draft' }
const t = (b, key) => b[key]
const text = row => String(draftStatusBadge(row, bundle, t)).replace(/<[^>]+>/g, '')

test('your own draft says "Draft"', () => {
  assert.equal(text({ IsActiveEntity: true, HasDraftEntity: true, _draftOwn: true }), 'Draft')
})

test("somebody else's draft says who holds it, as Fiori elements does", () => {
  assert.equal(text({ IsActiveEntity: true, HasDraftEntity: true, _draftOwn: false, _lockedBy: 'Alice Example' }), 'Locked by Alice Example')
})

test('a holder that could not be read keeps the generic text', () => {
  assert.equal(text({ IsActiveEntity: true, HasDraftEntity: true, _draftOwn: false }), 'Locked by Another User')
})
