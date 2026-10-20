const assert = require('node:assert/strict')
const { test } = require('node:test')

const { objectPageFragment, visibilityParts, titleIfChanged } = require('../../lib/render/object-page')

const form = (...fields) => ({ kind: 'form', fields })
const field = (path, hidden) => ({ field: { path, cqlPath: path, label: path }, hidden })
const noStock = { $Eq: [{ $Path: 'stock' }, 0] }

const layout = {
  entityType: 'S.Books',
  header: { title: { Value: { $Path: 'title' } }, typeName: 'Book' },
  headerFacets: [{ id: 'HF', kind: 'ReferenceFacet', label: 'HF', hidden: noStock, content: form(field('title')) }],
  sections: [
    { id: 'A', kind: 'ReferenceFacet', label: 'A', content: form(field('title'), field('extra', noStock), field('descr')) },
    { id: 'B', kind: 'ReferenceFacet', label: 'B', hidden: noStock, content: form(field('descr')) },
    { id: 'C', kind: 'ReferenceFacet', label: 'C', content: form(field('descr')) }
  ]
}
const ctx = { basePath: '/htmx/s', entitySetPath: 'Books', bundle: {}, t: () => '', trail: [] }
const row = stock => ({ ID: 'x', title: 'T', descr: 'd', extra: 'e', stock, IsActiveEntity: false, HasActiveEntity: true })
const part = (parts, id) => parts.find(p => p.target === '#' + id)

test('a hidden facet leaves a placeholder with its id, and the anchor bar skips it', () => {
  const html = String(objectPageFragment(layout, row(0), ctx))
  assert.match(html, /<div id="op-section--B" hidden><\/div>/)
  assert.match(html, /<div id="op-hfacet--HF" hidden><\/div>/)
  assert.doesNotMatch(html, /href="#op-section--B"/)
})

test('changing a property that a Hidden expression reads re-renders the facet, the form and the anchor bar', () => {
  const nowVisible = visibilityParts(layout, row(5), ctx, ['stock'])
  assert.match(String(part(nowVisible, 'op-section--B').html), /<section id="op-section--B"/) // appears
  assert.match(String(part(nowVisible, 'op-hfacet--HF').html), /class="hf-header-facet"/)
  assert.match(String(part(nowVisible, 'op-section--A').html), /--extra"/) // the form gets its field
  assert.match(String(part(nowVisible, 'op-anchor').html), /href="#op-section--B"/)

  const nowHidden = visibilityParts(layout, row(0), ctx, ['stock'])
  assert.match(String(part(nowHidden, 'op-section--B').html), /hidden/)
  assert.doesNotMatch(String(part(nowHidden, 'op-section--A').html), /--extra"/)
  assert.doesNotMatch(String(part(nowHidden, 'op-anchor').html), /op-section--B/)
})

test('unrelated properties produce no visibility updates', () => {
  assert.deepEqual(visibilityParts(layout, row(5), ctx, ['descr']), [])
})

test('the browser tab title follows the header title', () => {
  assert.equal(titleIfChanged(layout, { ...row(1), title: 'New Name' }, ctx, ['title']), 'New Name')
  assert.equal(titleIfChanged(layout, row(1), ctx, ['stock']), null)
})
