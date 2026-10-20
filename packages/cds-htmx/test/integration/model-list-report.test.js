const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { build } = require('../../lib/annotations/store')
const { scanService } = require('../../lib/annotations/manifest')
const { buildListReport } = require('../../lib/model/list-report')

const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')
const servicePath = '/odata/v4/catalog/'
const plain = v => JSON.parse(JSON.stringify(v)) // normalizes CAP's null-prototype objects for deepEqual

function listReportFor(entityType) {
  const model = cds.model
  const store = build(model, 'CatalogService', servicePath, { appRoot })
  const scan = scanService(appRoot, servicePath)
  const contextPath = `/${entityType.split('.').pop()}`
  return buildListReport(store, entityType, { pageSettings: scan.listReports[contextPath] })
}

// Golden snapshot: proves the XML layer's wholesale-replaced `UI.LineItem` (5 columns, title
// relabeled "Book Title (XML override)") reaches the layout model exactly as `store.js` layers
// it -- this is the direct end-to-end proof of "translate ALL resulting annotations to layout".
test('buildListReport(Books): header, filter bar and table reflect the fully layered store', () => {
  const lr = listReportFor('CatalogService.Books')

  assert.equal(lr.entityType, 'CatalogService.Books')
  assert.deepEqual(lr.header, { typeName: '{i18n>Book}', typeNamePlural: '{i18n>Books}' })

  assert.deepEqual(lr.filterBar.fields.map(f => f.path), ['author_ID', 'genre_ID', 'stockStatus'])
  assert.equal(lr.filterBar.fields[0].fieldControl, 'Mandatory') // author is @mandatory

  // the XML-overridden LineItem: 5 columns, not the 7 the compiled-only annotations.cds declares
  assert.equal(lr.table.columns.length, 5)
  assert.deepEqual(lr.table.columns.map(c => c.field.path), ['title', 'stock', 'stockStatus', 'author/name', 'price'])
  assert.equal(lr.table.columns[0].label, 'Book Title (XML override)')
  assert.equal(lr.table.columns[0].kind, 'UI.DataField')
  assert.deepEqual(plain(lr.table.columns[1].criticality), { $Path: 'stockCriticality' })
  assert.equal(lr.table.columns[3].field.cqlPath, 'author.name') // nav path -> CQL path
  assert.deepEqual(plain(lr.table.columns[4].field.currency), { $Path: 'currency_code' })

  // manifest page settings (tableSettings + variantManagement) win over fe-defaults
  assert.equal(lr.table.type, 'ResponsiveTable')
  assert.equal(lr.table.selectionMode, 'Multi')
  assert.equal(lr.table.growingThreshold, 20) // not set in manifest -> fe-defaults fallback
  assert.equal(lr.variantManagement, 'Page')
  assert.equal(lr.initialLoad, true)
})

test('buildListReport(Authors): no FE manifest ListReport target -> fe-defaults.js fills table settings', () => {
  const lr = listReportFor('CatalogService.Authors')

  assert.deepEqual(lr.header, { typeName: '{i18n>Author}', typeNamePlural: '{i18n>Authors}' })
  assert.deepEqual(lr.filterBar.fields.map(f => f.path), ['name'])
  assert.deepEqual(lr.table.columns.map(c => c.field.path), ['name', 'email', 'phone'])
  assert.equal(lr.table.columns[1].field.isEmail, true)
  assert.equal(lr.table.columns[2].field.isPhone, true)

  // no manifest settings for Authors -> straight fe-defaults.js values
  assert.equal(lr.table.type, 'ResponsiveTable')
  assert.equal(lr.table.selectionMode, 'Multi')
  assert.equal(lr.table.growingThreshold, 20)
  assert.equal(lr.variantManagement, 'None')
})

test('buildFilterBar() excludes properties annotated @UI.HiddenFilter', () => {
  const { buildFilterBar } = require('../../lib/model/list-report')
  const model = cds.model
  const store = build(model, 'CatalogService', servicePath, { appRoot })
  // Genres has no SelectionFields at all; simulate a hidden filter by asserting on an empty list
  // plus a synthetic store entry to prove the exclusion branch itself (not just the happy path).
  const synthetic = {
    targets: {
      ...store.targets,
      'CatalogService.Books/price': { ...store.raw('CatalogService.Books/price'), '@UI.HiddenFilter': true }
    }
  }
  Object.setPrototypeOf(synthetic, Object.getPrototypeOf(store))
  const fields = buildFilterBar(synthetic, 'CatalogService.Books', ['author_ID', 'price'])
  assert.deepEqual(fields.map(f => f.path), ['author_ID'])
})
