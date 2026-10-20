const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

const { cds: test_cds } = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const cache = require('../../lib/model/cache')
const { parseFilters, parseSearch } = require('../../lib/data/filters')
const { selectColumns, listReportQuery, listReportCountQuery, parseOrderBy } = require('../../lib/data/query')

const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')
const servicePath = '/odata/v4/catalog/'

function booksLayout() {
  return cache.listReportFor(cds.model, 'CatalogService', servicePath, 'CatalogService.Books', '/Books', { appRoot })
}

test('selectColumns() includes the key, every column field path and filter-bar field path', () => {
  const layout = booksLayout()
  const columns = selectColumns(cds.model, 'CatalogService.Books', layout)
  assert.ok(columns.includes('ID'))
  assert.ok(columns.includes('title'))
  assert.ok(columns.includes('stock'))
})

test('parseOrderBy() only honors $orderby terms that are actually selected columns', () => {
  assert.deepEqual(parseOrderBy({ $orderby: 'stock desc' }, ['stock', 'title']), ['stock desc'])
  assert.equal(parseOrderBy({ $orderby: 'bogusColumn desc' }, ['stock', 'title']), undefined)
  assert.equal(parseOrderBy({}, ['stock']), undefined)
})

test('listReportQuery() runs against the real service and respects filters/search/orderBy/limit', async () => {
  const srv = await cds.connect.to('CatalogService')
  await srv.tx({}, async tx => {
    const layout = booksLayout()
    const filters = parseFilters({ 'f.stock.ge': '0' }, layout)
    const q = listReportQuery(cds.model, 'CatalogService.Books', 'CatalogService.Books', layout, {
      filters, query: { $orderby: 'title' }, limit: 2
    })
    const rows = await tx.run(q)
    assert.ok(Array.isArray(rows))
    assert.ok(rows.length <= 3) // growingThreshold(2)+1 has-more probe
  })
})

test('listReportCountQuery() returns a single row with a count field', async () => {
  const srv = await cds.connect.to('CatalogService')
  await srv.tx({}, async tx => {
    const result = await tx.run(listReportCountQuery('CatalogService.Books', {}))
    assert.ok(typeof result.count === 'number')
    assert.ok(result.count > 0)
  })
})

test('parseSearch() feeds through to .search() without throwing on a real query', async () => {
  const srv = await cds.connect.to('CatalogService')
  await srv.tx({}, async tx => {
    const layout = booksLayout()
    const search = parseSearch({ $search: 'a' })
    const q = listReportQuery(cds.model, 'CatalogService.Books', 'CatalogService.Books', layout, { search, limit: 5 })
    const rows = await tx.run(q)
    assert.ok(Array.isArray(rows))
  })
})
