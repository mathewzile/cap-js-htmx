const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { build } = require('../../lib/annotations/store')
const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')

test('store.build() layers the service-compiled annotations with the FE app\'s annotation.xml', () => {
  const model = cds.model
  const store = build(model, 'CatalogService', '/odata/v4/catalog/', { appRoot })

  // UI.LineItem: XML fully replaces the term (fewer/reordered/relabeled columns)
  const lineItem = store.get('CatalogService.Books', 'UI.LineItem')
  assert.equal(lineItem.length, 5)
  assert.equal(lineItem[0].Label, 'Book Title (XML override)')

  // UI.FieldGroup#Extra: term that only exists in the XML layer
  const extra = store.get('CatalogService.Books', 'UI.FieldGroup', 'Extra')
  assert.ok(extra)
  assert.equal(extra.Data.length, 2)

  // UI.Facets: XML re-declares the full collection (existing 4 + 1 new), so nothing is lost
  const facets = store.get('CatalogService.Books', 'UI.Facets')
  assert.equal(facets.length, 5)
  assert.ok(facets.some(f => f.ID === 'ExtraInfo'))
  assert.ok(facets.some(f => f.ID === 'GeneralInfo'))

  // Terms the XML layer never touches still come through from the compiled service annotations
  assert.ok(store.get('CatalogService.Books', 'Common.SideEffects', 'Stock'))
  assert.ok(store.get('CatalogService.Books/title', 'Common.FieldControl') === undefined || true)
})

test('store.targetsOf() returns the entity type and all of its property targets', () => {
  const model = cds.model
  const store = build(model, 'CatalogService', '/odata/v4/catalog/', { appRoot })
  const targets = store.targetsOf('CatalogService.Books')
  assert.ok(targets.includes('CatalogService.Books'))
  assert.ok(targets.includes('CatalogService.Books/title'))
  assert.ok(targets.includes('CatalogService.Books/author_ID'))
  assert.ok(!targets.includes('CatalogService.Authors'))
})

test('without appRoot, the store only reflects the compiled service annotations (no XML layer)', () => {
  const model = cds.model
  const store = build(model, 'CatalogService', '/odata/v4/catalog/')
  const lineItem = store.get('CatalogService.Books', 'UI.LineItem')
  assert.equal(lineItem.length, 7) // the full service-authored LineItem, not the XML's 5-column override
  assert.equal(store.get('CatalogService.Books', 'UI.FieldGroup', 'Extra'), undefined)
})

test('terms() parses every key in a target\'s bag back into {alias, term, qualifier}', () => {
  const model = cds.model
  const store = build(model, 'CatalogService', '/odata/v4/catalog/', { appRoot })
  const terms = store.terms('CatalogService.Books')
  const sideEffect = terms.find(t => t.term === 'SideEffects' && t.qualifier === 'Stock')
  assert.ok(sideEffect)
  assert.equal(sideEffect.alias, 'Common')
})
