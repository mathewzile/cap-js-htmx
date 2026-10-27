const assert = require('node:assert/strict')
const { test } = require('node:test')

const { parseFilters, parseSearch } = require('../../lib/data/filters')

const layout = {
  filterBar: {
    fields: [
      { path: 'stock', cqlPath: 'stock' },
      { path: 'genre_ID', cqlPath: 'genre_ID' },
      { path: 'author/name', cqlPath: 'author.name' }
    ]
  }
}

const R = path => ({ ref: path.split('.') })
const V = val => ({ val })

test('parseFilters() builds an equality clause for a single value', () => {
  assert.deepEqual(parseFilters({ 'f.stock': '10' }, layout), [R('stock'), '=', V(10)])
})

test('parseFilters() builds an `in` clause for repeated values on the same field', () => {
  assert.deepEqual(parseFilters({ 'f.genre_ID': ['A', 'B'] }, layout), [R('genre_ID'), 'in', { list: [V('A'), V('B')] }])
})

test('parseFilters() understands the condition syntax of the Define Conditions dialog', () => {
  assert.deepEqual(parseFilters({ 'f.genre_ID': '*Low*' }, layout), [{ func: 'contains', args: [R('genre_ID'), V('Low')] }])
  assert.deepEqual(parseFilters({ 'f.genre_ID': 'Lo*' }, layout), [{ func: 'startswith', args: [R('genre_ID'), V('Lo')] }])
  assert.deepEqual(parseFilters({ 'f.genre_ID': '*ck' }, layout), [{ func: 'endswith', args: [R('genre_ID'), V('ck')] }])
  assert.deepEqual(parseFilters({ 'f.genre_ID': '!A' }, layout), [R('genre_ID'), '!=', V('A')])
  assert.deepEqual(parseFilters({ 'f.genre_ID': 'A;B*' }, layout), [{ xpr: [R('genre_ID'), '=', V('A'), 'or', { func: 'startswith', args: [R('genre_ID'), V('B')] }].flat() }])
  assert.deepEqual(parseFilters({ 'f.genre_ID': 'plain' }, layout), [R('genre_ID'), '=', V('plain')])
})

test('parseFilters() understands comparison and between conditions', () => {
  assert.deepEqual(parseFilters({ 'f.stock': '>=5' }, layout), [R('stock'), '>=', V(5)])
  assert.deepEqual(parseFilters({ 'f.stock': '<10' }, layout), [R('stock'), '<', V(10)])
  assert.deepEqual(parseFilters({ 'f.stock': '5...10' }, layout), [{ xpr: [R('stock'), '>=', V(5), 'and', R('stock'), '<=', V(10)] }])
})

test('parseFilters() supports range-operator suffixes (.ge/.le/.gt/.lt/.ne)', () => {
  assert.deepEqual(parseFilters({ 'f.stock.ge': '5' }, layout), [R('stock'), '>=', V(5)])
  assert.deepEqual(parseFilters({ 'f.stock.le': '20' }, layout), [R('stock'), '<=', V(20)])
})

test('parseFilters() combines multiple fields with `and`', () => {
  assert.deepEqual(
    parseFilters({ 'f.stock.ge': '5', 'f.genre_ID': 'A' }, layout),
    [R('stock'), '>=', V(5), 'and', R('genre_ID'), '=', V('A')]
  )
})

test('parseFilters() ignores query keys that are not whitelisted filter-bar fields', () => {
  assert.deepEqual(parseFilters({ 'f.__proto__': 'x', 'f.unknownPath': 'y', '$search': 'x' }, layout), [])
})

test('parseFilters() resolves a nav-path filter field to its dotted cqlPath', () => {
  assert.deepEqual(parseFilters({ 'f.author/name': 'Poe' }, layout), [R('author.name'), '=', V('Poe')])
})

test('parseFilters() coerces booleans and numbers, leaves other strings as-is', () => {
  assert.deepEqual(parseFilters({ 'f.genre_ID': 'true' }, layout), [R('genre_ID'), '=', V(true)])
  assert.deepEqual(parseFilters({ 'f.genre_ID': 'Fiction' }, layout), [R('genre_ID'), '=', V('Fiction')])
})

test('parseFilters() wraps string values as {val}, never as bare (SQL-verbatim) tokens', () => {
  assert.deepEqual(parseFilters({ 'f.genre_ID': "x' or 1=1 --" }, layout), [R('genre_ID'), '=', V("x' or 1=1 --")])
})

test('parseFilters() maps f.EditingStatus only for draft roots and only for known values', () => {
  const draftLayout = { filterBar: { ...layout.filterBar, editingStatus: true } }
  const ALL = [R('IsActiveEntity'), '=', V(false), 'or', R('SiblingEntity.IsActiveEntity'), '=', V(null)]
  assert.deepEqual(parseFilters({ 'f.EditingStatus': 'ALL' }, draftLayout), ALL)
  assert.deepEqual(parseFilters({}, draftLayout), ALL) // no status is "All": own drafts show beside the active rows
  assert.deepEqual(parseFilters({ 'f.stock': '1' }, draftLayout), [...ALL, 'and', R('stock'), '=', V(1)])
  assert.deepEqual(parseFilters({ 'f.EditingStatus': 'OWN_DRAFT' }, draftLayout), [R('IsActiveEntity'), '=', V(false)])
  assert.deepEqual(
    parseFilters({ 'f.EditingStatus': 'UNCHANGED', 'f.stock': '1' }, draftLayout),
    [R('IsActiveEntity'), '=', V(true), 'and', R('HasDraftEntity'), '=', V(false), 'and', R('stock'), '=', V(1)]
  )
  assert.deepEqual(parseFilters({ 'f.EditingStatus': '__proto__' }, draftLayout), ALL)
  assert.deepEqual(parseFilters({ 'f.EditingStatus': 'OWN_DRAFT' }, layout), []) // not a draft root
})

test('parseFilters() ignores empty-string values', () => {
  assert.deepEqual(parseFilters({ 'f.stock': '' }, layout), [])
})

test('parseSearch() trims and ignores a blank $search', () => {
  assert.equal(parseSearch({ $search: '  foo  ' }), 'foo')
  assert.equal(parseSearch({ $search: '   ' }), undefined)
  assert.equal(parseSearch({}), undefined)
})

test('parseFilters() converts a value by the Edm type of the field: a String of digits stays text', () => {
  const typed = { filterBar: { fields: [
    { path: 'isbn', cqlPath: 'isbn', edmType: 'Edm.String' },
    { path: 'stock', cqlPath: 'stock', edmType: 'Edm.Int32' },
    { path: 'flag', cqlPath: 'flag', edmType: 'Edm.Boolean' }
  ] } }
  assert.deepEqual(parseFilters({ 'f.isbn': '0123' }, typed), [R('isbn'), '=', V('0123')])
  assert.deepEqual(parseFilters({ 'f.isbn': ['1', '2'] }, typed), [R('isbn'), 'in', { list: [V('1'), V('2')] }])
  assert.deepEqual(parseFilters({ 'f.isbn': '*12*' }, typed), [{ func: 'contains', args: [R('isbn'), V('12')] }])
  assert.deepEqual(parseFilters({ 'f.stock': '10' }, typed), [R('stock'), '=', V(10)])
  assert.deepEqual(parseFilters({ 'f.flag': 'true' }, typed), [R('flag'), '=', V(true)])
  assert.deepEqual(parseFilters({ 'f.isbn': 'true' }, typed), [R('isbn'), '=', V('true')])
})
