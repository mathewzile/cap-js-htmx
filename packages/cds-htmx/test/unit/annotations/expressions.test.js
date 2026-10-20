const assert = require('node:assert/strict')
const { test } = require('node:test')
const { isExpr, resolvePath, paths, evaluate } = require('../../../lib/annotations/expressions')

test('isExpr() distinguishes dynamic-expression objects from literals/arrays/records', () => {
  assert.equal(isExpr({ $Path: 'stock' }), true)
  assert.equal(isExpr({ $Eq: [{ $Path: 'a' }, 1] }), true)
  assert.equal(isExpr('plain string'), false)
  assert.equal(isExpr(42), false)
  assert.equal(isExpr(null), false)
  assert.equal(isExpr([1, 2]), false)
  assert.equal(isExpr({ Value: { $Path: 'title' }, Label: 'Title' }), false) // a DataField record, no own $-key
})

test('resolvePath() follows single and navigation (nav/prop) paths against a row, null-safe', () => {
  const row = { title: 'Eleonora', author: { name: 'Poe' }, nested: { a: { b: 1 } } }
  assert.equal(resolvePath(row, 'title'), 'Eleonora')
  assert.equal(resolvePath(row, 'author/name'), 'Poe')
  assert.equal(resolvePath(row, 'nested/a/b'), 1)
  assert.equal(resolvePath(row, 'author/missing'), undefined)
  assert.equal(resolvePath(row, 'missing/name'), undefined)
  assert.equal(resolvePath(null, 'title'), undefined)
})

test('paths() collects every $Path referenced, deduplicated, ignoring plain literal strings', () => {
  const expr = {
    $If: [
      { $Gt: [{ $Path: 'stock' }, 0] },
      { $Path: 'stockStatus' },
      { $Function: 'odata.concat', $Apply: [{ $Path: 'stock' }, ' left'] }
    ]
  }
  assert.deepEqual(paths(expr).sort(), ['stock', 'stockStatus'])
  assert.deepEqual(paths('plain literal'), [])
  assert.deepEqual(paths(null), [])
})

test('evaluate(): $Path, $Null, $EnumMember', () => {
  const row = { stock: 5 }
  assert.equal(evaluate({ $Path: 'stock' }, row), 5)
  assert.equal(evaluate({ $Null: null }, row), null)
  assert.equal(evaluate({ $EnumMember: 'com.sap.vocabularies.UI.v1.CriticalityType/Negative' }, row), 'Negative')
})

test('evaluate(): comparison operators truth table', () => {
  const row = { a: 5, b: 10 }
  const A = { $Path: 'a' }, B = { $Path: 'b' }
  assert.equal(evaluate({ $Eq: [A, A] }, row), true)
  assert.equal(evaluate({ $Eq: [A, B] }, row), false)
  assert.equal(evaluate({ $Ne: [A, B] }, row), true)
  assert.equal(evaluate({ $Gt: [B, A] }, row), true)
  assert.equal(evaluate({ $Gt: [A, B] }, row), false)
  assert.equal(evaluate({ $Ge: [A, A] }, row), true)
  assert.equal(evaluate({ $Lt: [A, B] }, row), true)
  assert.equal(evaluate({ $Le: [A, A] }, row), true)
})

test('evaluate(): $And/$Or/$Not short-circuit over multiple operands', () => {
  const T = { $Eq: [1, 1] }, F = { $Eq: [1, 2] }
  assert.equal(evaluate({ $And: [T, T, T] }, {}), true)
  assert.equal(evaluate({ $And: [T, F, T] }, {}), false)
  assert.equal(evaluate({ $Or: [F, F, T] }, {}), true)
  assert.equal(evaluate({ $Or: [F, F] }, {}), false)
  assert.equal(evaluate({ $Not: F }, {}), true)
  assert.equal(evaluate({ $Not: T }, {}), false)
})

test('evaluate(): $If branches on the evaluated condition', () => {
  const row = { stock: 0 }
  const expr = { $If: [{ $Gt: [{ $Path: 'stock' }, 0] }, 'In Stock', 'Out of Stock'] }
  assert.equal(evaluate(expr, row), 'Out of Stock')
  assert.equal(evaluate(expr, { stock: 3 }), 'In Stock')
})

test('evaluate(): $Apply odata.concat, odata.uriEncode, odata.fillUriTemplate', () => {
  const row = { title: 'A Book', ID: 'abc/def' }
  assert.equal(evaluate({ $Function: 'odata.concat', $Apply: ['Book: ', { $Path: 'title' }] }, row), 'Book: A Book')
  assert.equal(evaluate({ $Function: 'odata.uriEncode', $Apply: [{ $Path: 'ID' }] }, row), encodeURIComponent('abc/def'))

  const template = {
    $Function: 'odata.fillUriTemplate',
    $Apply: ['/Books({ID})', { $Name: 'ID', $LabeledElement: { $Path: 'ID' } }]
  }
  assert.equal(evaluate(template, row), `/Books(${encodeURIComponent('abc/def')})`)
})

test('evaluate(): non-expression values pass through unchanged (literals, plain records)', () => {
  assert.equal(evaluate('plain', {}), 'plain')
  assert.equal(evaluate(42, {}), 42)
  assert.equal(evaluate(undefined, {}), undefined)
  const record = { Value: { $Path: 'x' }, Label: 'L' }
  assert.equal(evaluate(record, { x: 1 }), record) // opaque record, not itself an expression
})
