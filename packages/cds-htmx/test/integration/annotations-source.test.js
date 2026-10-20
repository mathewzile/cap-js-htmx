const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

// cds.compile.to.edm() returns null-prototype objects; deepStrictEqual treats that as a mismatch
// against plain object literals, so compare via a JSON round-trip instead.
const plain = v => JSON.parse(JSON.stringify(v))

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { annotationsOf } = require('../../lib/annotations/source')

test('annotationsOf() compiles the real service model to the same $Annotations shape as $metadata', async () => {
  const model = cds.model
  const ann = annotationsOf(model, 'CatalogService')

  assert.ok(ann['CatalogService.Books'], 'entity type target present')
  assert.ok(ann['CatalogService.Books/title'] || ann['CatalogService.Books']['@UI.LineItem'])
  assert.deepEqual(plain(ann['CatalogService.Books']['@Common.SideEffects#Stock']), {
    SourceProperties: ['stock'],
    TargetProperties: ['stockStatus', 'stockCriticality']
  })
  assert.ok(ann['CatalogService.Books']['@Common.SideEffects#alwaysFetchMessages'], 'draft root gets CAP-injected side effect')
})

test('annotationsOf() caches per (model, service) and returns the same object on repeat calls', () => {
  const model = cds.model
  const first = annotationsOf(model, 'CatalogService')
  const second = annotationsOf(model, 'CatalogService')
  assert.equal(first, second)
})

test('{i18n>key} placeholders are left unresolved by the compiler, even with a locale', () => {
  const model = cds.model
  const ann = annotationsOf(model, 'CatalogService', 'en')
  assert.match(ann['CatalogService.Books']['@UI.HeaderInfo'].TypeName, /^\{i18n>/)
})
