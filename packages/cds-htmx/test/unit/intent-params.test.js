const assert = require('node:assert/strict')
const { test } = require('node:test')
const { intentParams, missingRequired, mappingOf, pathPrefix } = require('../../lib/data/intent')

// the row of a book's page in the Authors app: its shown properties and key, and the draft columns the page loads for itself
const row = {
  ID: '3d2d2d2d-1c1c-4b4b-8a8a-000000000001', title: 'Wuthering Heights', stock: 12, price: '11.50', rating: 4.5,
  IsActiveEntity: true, HasActiveEntity: false, HasDraftEntity: false, DraftMessages: [], note: null, empty: ''
}

test('intentParams(): the properties the page shows and its keys, as strings, as Fiori elements passes them', () => {
  assert.deepEqual(intentParams(row), { ID: '3d2d2d2d-1c1c-4b4b-8a8a-000000000001', title: 'Wuthering Heights', stock: '12', price: '11.50', rating: '4.5' })
})

test('intentParams(): no draft or technical properties, no empty values, no nested objects', () => {
  const params = intentParams({ ...row, author: { name: 'Emily' }, DraftAdministrativeData_DraftUUID: 'x', SiblingEntity: 'y' })
  for (const name of ['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity', 'DraftMessages', 'note', 'empty', 'author', 'DraftAdministrativeData_DraftUUID', 'SiblingEntity']) {
    assert.ok(!(name in params), `${name} is not passed`)
  }
})

test('intentParams(): a false or zero value is a value', () => {
  assert.deepEqual(intentParams({ ID: 1, stock: 0, active: false }), { ID: '1', stock: '0', active: 'false' })
})

test('intentParams(): Mapping renames a local property to the name the target expects', () => {
  const mapping = [{ LocalProperty: { $PropertyPath: 'ID' }, SemanticObjectProperty: 'bookID' }, { LocalProperty: 'title', SemanticObjectProperty: 'name' }]
  assert.deepEqual(intentParams(row, { mapping }), { bookID: '3d2d2d2d-1c1c-4b4b-8a8a-000000000001', name: 'Wuthering Heights', stock: '12', price: '11.50', rating: '4.5' })
})

test('mappingOf(): entries without a local property or a name are dropped', () => {
  assert.deepEqual(mappingOf([{ LocalProperty: { $PropertyPath: 'a' }, SemanticObjectProperty: 'b' }, { SemanticObjectProperty: 'c' }, { LocalProperty: 'd' }, null]), { a: 'b' })
  assert.deepEqual(mappingOf(undefined), {})
})

test('RequiredProperties the page does not show are read separately and passed', () => {
  const required = [{ $PropertyPath: 'descr' }, { $PropertyPath: 'title' }, 'author_ID']
  assert.deepEqual(missingRequired(row, required), ['descr', 'author_ID'])
  const params = intentParams(row, { required }, { descr: 'A classic novel', author_ID: '9d703c23' })
  assert.equal(params.descr, 'A classic novel')
  assert.equal(params.author_ID, '9d703c23')
  assert.equal(params.title, 'Wuthering Heights')
})

test('a required property with no value anywhere is left out, not sent empty', () => {
  assert.deepEqual(intentParams({ ID: '1' }, { required: ['descr'] }, { descr: null }), { ID: '1' })
})

test('RequiredProperties never lets a draft property through the row filter unless it was asked for by name', () => {
  assert.ok(!('IsActiveEntity' in intentParams(row, { required: ['title'] })))
})

test('a page below another one passes every value under its path as well (Authors.books.ID), a top-level page does not', () => {
  assert.equal(pathPrefix("Authors(ID=1,IsActiveEntity=true)/books(ID=2)"), 'Authors.books')
  assert.equal(pathPrefix("Authors(ID=1,IsActiveEntity=true)"), '')
  const params = intentParams({ ID: 'b1', title: 'T' }, { prefix: 'Authors.books' })
  assert.deepEqual(params, { ID: 'b1', title: 'T', 'Authors.books.ID': 'b1', 'Authors.books.title': 'T' })
  assert.deepEqual(intentParams({ ID: 'b1' }, { prefix: '' }), { ID: 'b1' })
})
