const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const cache = require('../../lib/model/cache')

const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')
const servicePath = '/odata/v4/catalog/'

test('storeFor()/listReportFor()/objectPageFor() return the identical cached object on repeat calls', () => {
  const model = cds.model
  const store1 = cache.storeFor(model, 'CatalogService', servicePath, { appRoot })
  const store2 = cache.storeFor(model, 'CatalogService', servicePath, { appRoot })
  assert.equal(store1, store2)

  const lr1 = cache.listReportFor(model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
  const lr2 = cache.listReportFor(model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
  assert.equal(lr1, lr2)
  assert.equal(lr1.entityType, 'CatalogService.Books')

  const op1 = cache.objectPageFor(model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
  const op2 = cache.objectPageFor(model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
  assert.equal(op1, op2)
})

test('layout caches are keyed per entityType: Books and Authors never collide', () => {
  const model = cds.model
  const books = cache.listReportFor(model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
  const authors = cache.listReportFor(model, 'CatalogService', servicePath, 'CatalogService.Authors', '/Authors', { appRoot })
  assert.notEqual(books, authors)
  assert.equal(books.entityType, 'CatalogService.Books')
  assert.equal(authors.entityType, 'CatalogService.Authors')
})
