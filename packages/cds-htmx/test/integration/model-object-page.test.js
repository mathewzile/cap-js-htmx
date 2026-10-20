const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { build } = require('../../lib/annotations/store')
const { scanService } = require('../../lib/annotations/manifest')
const { buildObjectPage } = require('../../lib/model/object-page')

const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')
const servicePath = '/odata/v4/catalog/'
const plain = v => JSON.parse(JSON.stringify(v))

function objectPageFor(entityType, contextPath) {
  const model = cds.model
  const store = build(model, 'CatalogService', servicePath, { appRoot })
  const scan = scanService(appRoot, servicePath)
  return buildObjectPage(model, store, entityType, { pageSettings: scan.objectPages[contextPath] })
}

// Golden snapshot: Books OP exercises every Facet content kind the §3.2 matrix lists as supported
// (form/FieldGroup, DataPoint, sub-OP table-via-navigation, and the XML-added FieldGroup#Extra
// section) in one real entity -- proving the whole annotation graph, not just one term, reaches
// the layout model.
test('buildObjectPage(Books): sections cover form/dataPoint/table/XML-added-facet content kinds', () => {
  const op = objectPageFor('CatalogService.Books', '/Books')

  assert.deepEqual(plain(op.header.title), { Value: { $Path: 'title' } })
  assert.deepEqual(plain(op.header.description), { Value: { $Path: 'descr' } })
  assert.equal(op.header.typeImageUrl, 'sap-icon://learning-assistant')

  assert.deepEqual(op.sections.map(s => s.id), ['GeneralInfo', 'Availability', 'RatingFacet', 'Chapters', 'ExtraInfo'])

  const general = op.sections[0]
  assert.equal(general.content.kind, 'form')
  assert.deepEqual(general.content.fields.map(f => f.field.path), ['title', 'descr', 'author_ID', 'genre_ID'])
  assert.equal(general.content.fields[1].field.multiline, true) // descr @UI.MultiLineText

  const rating = op.sections[2]
  assert.equal(rating.content.kind, 'dataPoint')
  assert.equal(rating.content.dataPoint.Visualization, 'Rating')
  assert.equal(rating.content.dataPoint.TargetValue, 5)

  // sub-object-page table section: navigation resolved via CSN (edm.js), columns from the
  // *layered* Chapters LineItem -- proves facet-driven sub-OP composition works end to end
  const chapters = op.sections[3]
  assert.equal(chapters.content.kind, 'table')
  assert.equal(chapters.content.targetEntityType, 'CatalogService.Chapters')
  assert.deepEqual(chapters.content.columns.map(c => c.field.path), ['title', 'pages'])

  // the XML-added facet + FieldGroup#Extra (proves XML can both override LineItem AND add new terms)
  const extra = op.sections[4]
  assert.equal(extra.label, 'Extra Info (from annotation.xml)')
  assert.equal(extra.content.kind, 'form')
  assert.deepEqual(extra.content.fields.map(f => f.field.path), ['rating', 'totalPages'])

  // manifest page settings: editableHeaderContent:false is explicit in books-fe's manifest.json
  assert.equal(op.editableHeaderContent, false)
})

test('buildObjectPage(Authors): Communication.Contact facet + a nav-path LineItem facet reusing the layered Books store', () => {
  const op = objectPageFor('CatalogService.Authors', '/Authors')

  const contact = op.sections.find(s => s.id === 'ContactInfo')
  assert.equal(contact.content.kind, 'contact')
  assert.deepEqual(plain(contact.content.contact.fn), { $Path: 'name' })

  const books = op.sections.find(s => s.id === 'AuthorBooks')
  assert.equal(books.content.kind, 'table')
  assert.equal(books.content.targetEntityType, 'CatalogService.Books')
  // same 5-column XML-overridden LineItem as the Books LR/OP -- the layered store is shared
  assert.deepEqual(books.content.columns.map(c => c.field.path), ['title', 'stock', 'stockStatus', 'author/name', 'price'])
  assert.equal(books.content.columns[0].label, 'Book Title (XML override)')

  // no FE manifest ObjectPage target for /Authors -> fe-defaults.js
  assert.equal(op.editableHeaderContent, true)
})

test('buildObjectPage(Chapters): the sub-OP itself, addressed via its own entity type/contextPath', () => {
  const op = objectPageFor('CatalogService.Chapters', '/Books/chapters')

  assert.deepEqual(plain(op.header), {
    typeName: '{i18n>Chapter}',
    typeNamePlural: '{i18n>Chapters}',
    title: { Value: { $Path: 'title' } }
  })
  assert.deepEqual(op.sections.map(s => s.id), ['ChapterInfo'])
  assert.deepEqual(op.sections[0].content.fields.map(f => f.field.path), ['title', 'pages'])
})
