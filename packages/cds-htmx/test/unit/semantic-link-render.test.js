const assert = require('node:assert/strict')
const { test } = require('node:test')
const { formField, semanticLink } = require('../../lib/render/field')
const { rowMarkup } = require('../../lib/render/table')

const field = { path: 'name', cqlPath: 'name', label: 'Name', semanticObject: 'Authors' }
const col = { kind: 'UI.DataField', field }

test('a property with Common.SemanticObject shows its value as a link that carries the object, the parameter and the value', () => {
  const out = String(semanticLink(field, 'Emily'))
  assert.match(out, /data-hf-semantic-object="Authors" data-hf-semantic-param="name" data-hf-semantic-value="Emily">Emily<\/a>/)
})

test('in a form (display mode) and in a table cell the value is that link; in edit mode it stays an input', () => {
  const display = String(formField(col, { name: 'Emily' }, { facetId: 'f', basePath: '/b', entitySetPath: 'Authors(1)' }))
  assert.match(display, /hf-semantic-link/)
  const edit = String(formField(col, { name: 'Emily' }, { facetId: 'f', basePath: '/b', entitySetPath: 'Authors(1)', editMode: 'draft' }))
  assert.ok(!edit.includes('hf-semantic-link'))
  const layout = { entityType: 'S.Authors', table: { columns: [col], extraColumns: [] }, semanticKey: [], navigable: true }
  const row = String(rowMarkup(layout, { ID: '1', name: 'Emily' }, { basePath: '/b', entitySetPath: 'Authors', keyNames: ['ID'], bundle: {}, t: () => '', numeric: [false], selectable: true, types: [undefined] }))
  assert.match(row, /hf-semantic-link/)
})

test('a value that is not there is no link, and a property without a semantic object is plain text', () => {
  assert.ok(!String(formField(col, { name: null }, { facetId: 'f' })).includes('hf-semantic-link'))
  assert.ok(!String(formField({ kind: 'UI.DataField', field: { ...field, semanticObject: undefined } }, { name: 'E' }, { facetId: 'f' })).includes('hf-semantic-link'))
})
