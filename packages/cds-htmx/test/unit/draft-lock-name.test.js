const assert = require('node:assert/strict')
const { test } = require('node:test')
const { draftStatusBadge } = require('../../lib/render/table')

const bundle = {
  Draft: 'Draft', UnsavedChangesBy: 'Unsaved changes by {0}', UnsavedChangesByAnotherUser: 'Unsaved Changes by Another User', UnsavedChanges: 'Unsaved Changes',
  UnsavedChangesText: 'This object has unsaved changes made by {0}.', UnsavedChangesTextAnotherUser: 'This object has unsaved changes made by another user.', LastChangedOn: 'Last changed on {0}.'
}
const t = (b, key) => b[key]
const markup = row => String(draftStatusBadge(row, bundle, t, 'en'))
const text = row => markup(row).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

test('your own draft says "Draft"', () => {
  assert.equal(text({ IsActiveEntity: true, HasDraftEntity: true, _draftOwn: true }), 'Draft')
})

test("somebody else's draft says who holds it, as Fiori elements does", () => {
  const row = { IsActiveEntity: true, HasDraftEntity: true, _draftOwn: false, _lockedBy: 'Alice Example', _lockedAt: '2026-10-27T11:06:42.000Z' }
  // an icon button with the text, and the popover: title, who, when
  assert.match(markup(row), /<button[^>]*data-hf-popover-toggle[^>]*><i class="sap-icon--user-edit"/)
  assert.match(text(row), /^Unsaved changes by Alice Example Unsaved Changes This object has unsaved changes made by Alice Example\. Last changed on .*2026.*\.$/)
})

test('a holder that could not be read keeps the generic text', () => {
  assert.match(text({ IsActiveEntity: true, HasDraftEntity: true, _draftOwn: false }), /^Unsaved Changes by Another User Unsaved Changes This object has unsaved changes made by another user\.$/)
})
