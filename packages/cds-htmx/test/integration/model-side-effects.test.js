const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { build } = require('../../lib/annotations/store')
const { buildSideEffects, actionSideEffects } = require('../../lib/model/side-effects')

const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')
const servicePath = '/odata/v4/catalog/'

function storeFor() {
  return build(cds.model, 'CatalogService', servicePath, { appRoot })
}

test('buildSideEffects(Books) indexes all three SideEffects#qualifiers by their trigger', () => {
  const idx = buildSideEffects(storeFor(), 'CatalogService.Books')

  assert.equal(idx.effects.length, 4) // Stock, Pages, Push, CAP-generated alwaysFetchMessages

  assert.deepEqual([...idx.byProperty.keys()], ['stock'])
  assert.deepEqual(idx.byProperty.get('stock')[0].TargetProperties, ['stockStatus', 'stockCriticality'])

  assert.deepEqual([...idx.byNavigation.keys()].sort(), ['', 'chapters'])
  assert.deepEqual(idx.byNavigation.get('chapters')[0].TargetProperties, ['totalPages'])
  assert.deepEqual(idx.byNavigation.get('')[0].TargetProperties, ['DraftMessages']) // CAP's #alwaysFetchMessages

  assert.deepEqual([...idx.byEvent.keys()], ['StockChanged'])
  assert.deepEqual(idx.byEvent.get('StockChanged')[0].TargetProperties, ['stock', 'stockStatus', 'stockCriticality'])
})

test('actionSideEffects() reads the bound action overload target (edm.js target-string shape)', () => {
  const store = storeFor()
  const effects = actionSideEffects(store, 'CatalogService.addStock(CatalogService.Books)')
  assert.deepEqual(effects.TargetProperties, ['stock', 'stockStatus', 'stockCriticality'])
})

test('buildSideEffects() on an entity with no SideEffects at all returns empty indexes, not undefined', () => {
  const idx = buildSideEffects(storeFor(), 'CatalogService.Genres')
  assert.deepEqual(idx.effects, [])
  assert.equal(idx.byProperty.size, 0)
  assert.equal(idx.byNavigation.size, 0)
  assert.equal(idx.byEvent.size, 0)
})
