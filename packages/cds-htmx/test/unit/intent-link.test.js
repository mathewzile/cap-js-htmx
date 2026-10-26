const { test } = require('node:test')
const assert = require('node:assert')
const { facetBlock } = require('../../lib/render/object-page')

const intent = { kind: 'UI.DataFieldForIntentBasedNavigation', label: 'Open Manage Books App', semanticObject: 'Books', action: 'manage' }
const facet = { kind: 'ReferenceFacet', id: 'General', label: 'General', content: { kind: 'form', fields: [intent] } }

test('a DataFieldForIntentBasedNavigation is a button in the section heading row, not a form field', () => {
  const out = String(facetBlock(facet, {}, {}, { asSection: true }))
  assert.match(out, /<div class="hf-section__header">\s*<h2 class="hf-section__title">General<\/h2>\s*<div class="hf-section__actions">/)
  assert.match(out, /data-hf-intent-object="Books"/)
  assert.match(out, /data-hf-intent-action="manage"/)
  assert.match(out, />Open Manage Books App</)
  assert.doesNotMatch(out.split('hf-section__card')[1], /hf-intent/)
})
