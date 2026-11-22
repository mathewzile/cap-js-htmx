const assert = require('node:assert/strict')
const { test } = require('node:test')
const { formField } = require('../../lib/render/field')
const { rowMarkup } = require('../../lib/render/table')

const col = { kind: 'UI.DataFieldWithIntentBasedNavigation', semanticObject: 'Authors', action: 'manage', field: { path: 'name', cqlPath: 'name', label: 'Name' } }

test('DataFieldWithIntentBasedNavigation in a form shows its value as a link that carries the intent and its context', () => {
  const out = String(formField(col, { name: 'Emily' }, { facetId: 'f', basePath: '/htmx/admin', entitySetPath: "Authors(ID='1')" }))
  assert.match(out, /<a [^>]*data-hf-intent-object="Authors"[^>]*data-hf-intent-action="manage"/)
  assert.match(out, /data-hf-intent-context="\/htmx\/admin\/\$intent\?path=Authors%28ID%3D%271%27%29&amp;so=Authors&amp;action=manage"|data-hf-intent-context="[^"]*\$intent\?path=/)
  assert.match(out, />Emily<\/a>/)
})

test('an empty value is no link', () => {
  const out = String(formField(col, { name: null }, { facetId: 'f', basePath: '/b', entitySetPath: 'Authors(1)' }))
  assert.ok(!out.includes('data-hf-intent-object'))
})

test('in a table row the cell is a link, and its context is that row', () => {
  const layout = { entityType: 'S.Authors', table: { columns: [col], extraColumns: [], hierarchy: undefined }, semanticKey: [], navigable: true }
  const out = String(rowMarkup(layout, { ID: '7', name: 'Emily' }, { basePath: '/htmx/admin', entitySetPath: 'Authors', keyNames: ['ID'], bundle: {}, t: () => '', numeric: [false], selectable: true, types: [undefined] }))
  assert.match(out, /<a [^>]*data-hf-intent-object="Authors"/)
  assert.ok(out.includes('$intent?path=Authors%28ID%3D%277%27%29&amp;so=Authors'))
})

test('a DataFieldForIntentBasedNavigation of a LineItem is a toolbar button, not a column', () => {
  const { toolbarIntents, tableColumns } = require('../../lib/render/table')
  const action = { kind: 'UI.DataFieldForIntentBasedNavigation', semanticObject: 'Books', action: 'display', label: 'Open', requiresContext: true }
  const layout = { table: { columns: [col, action], extraColumns: [] } }
  assert.deepEqual(toolbarIntents(layout), [action])
  assert.deepEqual(tableColumns(layout), [col])
  const out = String(rowMarkup({ entityType: 'S.Authors', table: layout.table, semanticKey: [], navigable: true }, { ID: '7', name: 'E' }, { basePath: '/b', entitySetPath: 'Authors', keyNames: ['ID'], bundle: {}, t: () => '', numeric: [false], selectable: true, types: [undefined] }))
  assert.equal((out.match(/hf-col-\d/g) ?? []).length, 1, 'one data cell')
})

test('a toolbar button has a context URL without a path: the click adds the selected row', () => {
  const { intentAttrs } = require('../../lib/render/field')
  const out = String(intentAttrs({ semanticObject: 'Books', action: 'manage' }, { basePath: '/htmx/admin' }))
  assert.match(out, /data-hf-intent-context="\/htmx\/admin\/\$intent\?so=Books&amp;action=manage"/)
})

test('a Common.SemanticObject link passes the value under the name SemanticObjectMapping gives and lists the actions that are not offered', () => {
  const { semanticLink } = require('../../lib/render/field')
  const field = { path: 'author/name', semanticObject: 'Authors', semanticLink: { mapping: { name: 'authorName' }, unavailableActions: ['delete', 'display'] } }
  const out = String(semanticLink(field, 'Emily'))
  assert.match(out, /data-hf-semantic-param="authorName"/)
  assert.match(out, /data-hf-semantic-unavailable="delete display"/)
  const plain = String(semanticLink({ path: 'name', semanticObject: 'Authors' }, 'Emily'))
  assert.match(plain, /data-hf-semantic-param="name"/)
  assert.doesNotMatch(plain, /data-hf-semantic-unavailable/)
})
