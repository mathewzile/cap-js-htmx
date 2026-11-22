// UI.Chart on an Object Page: `books/@UI.Chart` of an Authors page, drawn as inline SVG from the author's books.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
cds.test(path.join(__dirname, '..', '..', '..', '..'))

const cache = require('../../lib/model/cache')
const { loadObjectPage } = require('../../lib/data/page')
const objectPageRender = require('../../lib/render/object-page')
const i18n = require('../../lib/i18n')

const EMILY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001'
// the layout caches are keyed by locale, not by app folder: a locale of its own keeps this app apart from the real ones
const opts = { appRoot: path.join(__dirname, '..', 'fixtures', 'chart-app'), locale: 'it' }

describe('chart facet', () => {
  test('the facet is a chart over the navigation, with the dimensions and measures of the annotation', () => {
    const layout = cache.objectPageFor(cds.model, 'AdminService', '/admin/', 'AdminService.Authors', '/Authors', opts)
    const { content } = layout.sections.find(f => f.id === 'Prices')
    assert.equal(content.kind, 'chart')
    assert.equal(content.nav, 'books')
    assert.equal(content.chart.title, 'Price per book')
    assert.deepEqual(content.chart.dimensions.map(d => d.path), ['title'])
    assert.deepEqual(content.chart.measures.map(m => m.path), ['price', 'stock'])
  })

  test('the page draws a group of bars per book, with a legend for the two measures', async () => {
    const layout = cache.objectPageFor(cds.model, 'AdminService', '/admin/', 'AdminService.Authors', '/Authors', opts)
    const page = await cds.services.AdminService.tx(tx => loadObjectPage(tx, {
      service: 'AdminService', servicePath: '/admin/', entityType: 'AdminService.Authors', keys: { ID: EMILY, IsActiveEntity: true }, contextPath: '/Authors', ...opts
    }))
    const books = page.children.Prices.rows
    assert.ok(books.length >= 2, 'the books are read')
    const html = String(objectPageRender.objectPageFragment(layout, page.row, {
      basePath: '/htmx/admin', entitySetPath: `Authors(ID=${EMILY},IsActiveEntity=true)`, trail: [], children: page.children, bundle: page.bundle, t: i18n.t
    }))
    assert.match(html, /<svg class="hf-chart__svg"[^>]*role="img"/)
    assert.equal((html.match(/<rect /g) ?? []).length, books.length * 2, 'one bar per measure and book')
    assert.ok(html.includes(books[0].title), 'a book title is on the axis or in a tooltip')
    assert.match(html, /hf-chart__legend/)
  })
})
