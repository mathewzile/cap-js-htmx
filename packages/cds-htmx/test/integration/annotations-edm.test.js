const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const edm = require('../../lib/annotations/edm')

test('parseTarget() classifies every target shape seen in real compiled $Annotations', () => {
  assert.deepEqual(edm.parseTarget('CatalogService.Books'), { kind: 'type', entity: 'CatalogService.Books' })
  assert.deepEqual(edm.parseTarget('CatalogService.Books/title'), { kind: 'property', entity: 'CatalogService.Books', path: 'title' })
  assert.deepEqual(edm.parseTarget('CatalogService.Books/author/name'), { kind: 'property', entity: 'CatalogService.Books', path: 'author/name' })
  assert.deepEqual(edm.parseTarget('CatalogService.EntityContainer/Books'), {
    kind: 'container-member', container: 'CatalogService.EntityContainer', entity: 'CatalogService.Books'
  })
  assert.deepEqual(edm.parseTarget('CatalogService.addStock(CatalogService.Books)'), {
    kind: 'action', action: 'CatalogService.addStock', boundEntity: 'CatalogService.Books', param: undefined
  })
  assert.deepEqual(edm.parseTarget('CatalogService.addStock(CatalogService.Books)/quantity'), {
    kind: 'action', action: 'CatalogService.addStock', boundEntity: 'CatalogService.Books', param: 'quantity'
  })
})

test('cqlPath() turns an OData navigation path into CQL dotted syntax', () => {
  assert.equal(edm.cqlPath('author/name'), 'author.name')
  assert.equal(edm.cqlPath('stock'), 'stock')
  assert.equal(edm.cqlPath('chapters/title'), 'chapters.title')
})

test('resolveElement() follows a navigation path to the target entity\'s CSN element', async () => {
  const model = cds.model
  const el = edm.resolveElement(model, 'CatalogService.Books', 'author/name')
  assert.ok(el, 'element resolved')
  assert.equal(el.type, 'cds.String')

  const direct = edm.resolveElement(model, 'CatalogService.Books', 'title')
  assert.equal(direct.type, 'cds.String')

  assert.equal(edm.resolveElement(model, 'CatalogService.Books', 'noSuchPath'), undefined)
})

test('keyElements() returns both the active-entity key and the lean-draft IsActiveEntity key', () => {
  const model = cds.model
  const books = edm.entityDef(model, 'CatalogService.Books')
  const keys = edm.keyElements(books).map(e => e.name)
  assert.ok(keys.includes('ID'))
  assert.ok(keys.includes('IsActiveEntity'))
})
