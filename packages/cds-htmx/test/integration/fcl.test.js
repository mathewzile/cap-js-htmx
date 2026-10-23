// Flexible Column Layout (render/fcl.js) and manifest routing (annotations/manifest.js): the `manage-authors-htmx` app
// puts the admin service's Authors in a three column layout (List Report | Author | one of the author's books).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { GET } = cds.test(path.join(__dirname, '..', '..', '..', '..'))
const { scanManifest } = require('../../lib/annotations/manifest')
const { rowMarkup } = require('../../lib/render/table')
const ids = require('../../lib/render/ids')

const HX = { 'HX-Request': 'true' }
const FRAGMENT = { ...HX, 'X-Hf-Fcl': '1' }
const get = async (url, headers = {}) => String((await GET(url, { headers })).data)
const unescape = s => s.replace(/&#39;/g, "'")
const CHARLOTTE = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001' // has books

let authorUrl, bookUrl
const findUrls = async () => {
  authorUrl = `/htmx/admin/Authors(ID='${CHARLOTTE}')`
  const row = /hx-get="(\/htmx\/admin\/Authors\([^"]+\)\/books\([^"]+\))"/.exec(await get(authorUrl, HX))
  bookUrl = row && unescape(row[1])
}

describe('flexible column layout', () => {
  before(findUrls)

  test('a List Report opens the layout with one column', async () => {
    const page = await get('/htmx/admin/Authors')
    assert.match(page, /<div id="fcl" class="hf-fcl" data-hf-layout="OneColumn" data-hf-deepest="0">/)
    assert.match(page, /<section id="fcl-col-0"[^>]*data-hf-col="0">\s*<div class="hf-fcl__scroll">\s*<div[^>]*hf-page--lr/s)
    assert.match(page, /<section id="fcl-col-1"[^>]* hidden>/)
    assert.match(page, /<section id="fcl-col-2"[^>]* hidden>/)
  })

  test('an Object Page opened directly loads the List Report column beside it', async () => {
    const page = await get(authorUrl)
    assert.match(page, /data-hf-layout="TwoColumnsMidExpanded" data-hf-deepest="1"/)
    assert.match(page, /<section id="fcl-col-0"[^>]*hx-get="\/htmx\/admin\/Authors"[^>]*hx-trigger="load"[^>]*"X-Hf-Fcl":"keep"/s)
    assert.match(page, /<section id="fcl-col-1"[^>]*>[\s\S]*?<div id="op-page"/)
    assert.match(page, /<div class="hf-fcl__sep" data-hf-sep/, 'the column has a separator to drag')
    assert.doesNotMatch(page, /hf-breadcrumb/, 'columns replace the breadcrumb')
    assert.match(page, /data-hf-fcl-fullscreen/)
    assert.match(page, /hx-get="\/htmx\/admin\/Authors"[^>]*"X-Hf-Fcl":"shown"/, 'Close goes back to the List Report')
  })

  test('with the layout on screen only the column is answered, the columns to its right are emptied', async () => {
    const res = await get(authorUrl, FRAGMENT)
    assert.doesNotMatch(res, /id="fcl"/)
    assert.match(res, /<hx-partial hx-target="#fcl-col-1" hx-swap="outerHTML"><section id="fcl-col-1"/)
    assert.match(res, /<hx-partial hx-target="#fcl-col-2" hx-swap="outerHTML"><section id="fcl-col-2"[^>]* hidden>/)
    assert.match(res, /<hx-partial hx-target="#fcl-marker" hx-swap="outerHTML"><span id="fcl-marker" hidden data-hf-col="1" data-hf-layout="TwoColumnsMidExpanded">/)
    assert.match(res, /<hx-partial hx-target="#hf-live"/)
    assert.match(res, /<title>/)
  })

  test('a column that is only being filled in changes nothing else (no trim, no title, no marker)', async () => {
    const res = await get('/htmx/admin/Authors', { ...HX, 'X-Hf-Fcl': 'keep' })
    assert.match(res, /<hx-partial hx-target="#fcl-col-0"/)
    assert.doesNotMatch(res, /fcl-col-1|fcl-marker|<title>|#hf-live/)
  })

  test('Close answers with the trimmed layout and renders nothing', async () => {
    const res = await get(authorUrl, { ...HX, 'X-Hf-Fcl': 'shown' })
    assert.doesNotMatch(res, /op-page/)
    assert.match(res, /#fcl-col-2/)
    assert.match(res, /data-hf-col="1" data-hf-layout="TwoColumnsMidExpanded"/)
    const closeList = await get('/htmx/admin/Authors', { ...HX, 'X-Hf-Fcl': 'shown' })
    assert.match(closeList, /data-hf-col="0" data-hf-layout="OneColumn"/)
  })

  test('a sub-object page is the third column; its ids carry the column so they do not clash with the Object Page', async () => {
    assert.ok(bookUrl, 'the author page links to a book')
    const page = await get(bookUrl)
    assert.match(page, /data-hf-layout="ThreeColumnsEndExpanded" data-hf-deepest="2"/)
    assert.match(page, /<section id="fcl-col-0"[^>]*hx-get="\/htmx\/admin\/Authors"/)
    assert.match(page, /<section id="fcl-col-1"[^>]*hx-get="\/htmx\/admin\/Authors\(/)
    assert.match(page, /<div id="c2-op-page"/)
    assert.doesNotMatch(page, /id="op-page"/)
  })

  test('ids are scoped to the column of the page being rendered, outside a layout nothing is prefixed', () => {
    assert.equal(ids.opPage(), 'op-page')
    ids.inColumn(2, () => assert.equal(ids.opPage(), 'c2-op-page'))
    ids.inColumn(2, () => { ids.setColumn(1); assert.equal(ids.opPage(), 'op-page') })
    assert.equal(ids.unprefixed('c2-op-field--A--b'), 'op-field--A--b')
  })

  test('sets that no manifest puts in a layout are rendered as before', async () => {
    const page = await get('/htmx/catalog/Books')
    assert.doesNotMatch(page, /id="fcl"/)
    assert.match(page, /<div id="app">/)
  })
})

describe('manifest routing', () => {
  const manifest = routes => ({
    'sap.app': { dataSources: { mainService: { uri: '/admin/', type: 'OData' } } },
    'sap.ui5': {
      routing: {
        routes,
        targets: {
          List: { name: 'sap.fe.templates.ListReport', options: { settings: { contextPath: '/Books', navigation: { Books: { detail: { route: 'Object' } }, chapters: { detail: { route: 'Nowhere' } } } } } },
          Object: { name: 'sap.fe.templates.ObjectPage', options: { settings: { contextPath: '/Books' } } }
        }
      }
    }
  })

  test('only navigations whose route exists in the manifest are navigable', () => {
    const scan = scanManifest(manifest([{ name: 'List' }, { name: 'Object' }]), '/admin/')
    assert.deepEqual(scan.listReports['/Books'].$navigation, { Books: true })
    assert.deepEqual(scan.objectPages['/Books'].$navigation, {}, 'an Object Page without navigation entries opens nothing')
  })

  test('a manifest without routes leaves navigation alone', () => {
    const scan = scanManifest(manifest([]), '/admin/')
    assert.equal(scan.listReports['/Books'].$navigation, undefined)
  })

  test('a Flexible Column Layout is recognised by router class, root view or config', () => {
    const base = manifest([{ name: 'List' }])
    const ui5 = base['sap.ui5']
    assert.equal(scanManifest(base, '/admin/').fcl, undefined)
    for (const patch of [{ routing: { ...ui5.routing, config: { routerClass: 'sap.f.routing.Router' } } }, { rootView: { viewName: 'sap.fe.templates.RootContainer.view.Fcl' } }, { routing: { ...ui5.routing, config: { flexibleColumnLayout: {} } } }]) {
      const fcl = scanManifest({ ...base, 'sap.ui5': { ...ui5, ...patch } }, '/admin/').fcl
      assert.deepEqual(fcl, { roots: ['/Books'], layouts: { two: 'TwoColumnsMidExpanded', three: 'ThreeColumnsMidExpanded' } })
    }
  })

  test('a row without a route does not open a page', () => {
    const ctx = { basePath: '/htmx/admin', entitySetPath: 'Books', keyNames: ['ID'], bundle: {}, t: k => k, numeric: [], selectable: false }
    const closed = rowMarkup({ navigable: false, table: { columns: [] } }, { ID: 'a' }, ctx).value
    assert.doesNotMatch(closed, /hx-get|activable|slim-arrow-right/)
    const open = rowMarkup({ navigable: true, table: { columns: [] } }, { ID: 'a' }, ctx).value
    assert.match(open, /hx-get="\/htmx\/admin\/Books\(ID=&#39;a&#39;\)"/)
  })
})

describe('the Work Zone app', () => {
  test('a page requested for manage-authors-htmx (X-Htmx-App) is laid out in columns, one for manage-books-htmx is not', async () => {
    const authors = await get('/htmx/admin/Authors', { ...HX, 'X-Htmx-App': 'manageauthors.htmx@1.0.0' })
    assert.match(authors, /<div id="fcl" class="hf-fcl" data-hf-layout="OneColumn"/)
    const books = await get('/htmx/catalog/Books', { ...HX, 'X-Htmx-App': 'managebooks.htmx@1.0.0' })
    assert.doesNotMatch(books, /id="fcl"/)
  })
})
