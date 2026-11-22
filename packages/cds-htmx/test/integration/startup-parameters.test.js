// Intent-based navigation, target side: `GET /$startup` says where an app opens for the startup parameters a launchpad hands it. The
// reference is the Fiori elements Manage Books / Manage Authors apps in the local launchpad (`#Books-manage?...`):
//   author_ID=<id>            -> the List Report, filtered by the author
//   ID=<id>                   -> the List Report, filtered to that row (part of the technical key does NOT open the page)
//   ID=<id>&IsActiveEntity=true -> the Object Page (the full technical key does, in FE as here)
//   title=Jane Eyre           -> the Object Page of that book (title is the semantic key); an unknown parameter is ignored
//   Authors ID=<id>           -> the List Report filtered to the row (no semantic key, a draft root)
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const { sanitize, filterQuery, semanticValues } = require('../../lib/data/startup')

const HX = { 'HX-Request': 'true' }
const EMILY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001'
const JANE_EYRE = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002'
const startup = (service, set, params) => api.GET(`/htmx/${service}/$startup?${new URLSearchParams({ set, params: JSON.stringify(params) })}`, { headers: HX, validateStatus: () => true })
const routeOf = async (...args) => (await startup(...args)).data.route

describe('GET /$startup (where an app opens for its startup parameters)', () => {
  test('a parameter that is a filter field filters the List Report', async () => {
    assert.equal(await routeOf('catalog', 'Books', { author_ID: [EMILY] }), `/Books?f.author_ID=${EMILY}`)
  })

  test('the technical key alone only filters: the List Report stays, as in Fiori elements', async () => {
    assert.equal(await routeOf('catalog', 'Books', { ID: [JANE_EYRE] }), `/Books?f.ID=${JANE_EYRE}`)
  })

  test('the full technical key, IsActiveEntity included, opens the Object Page (as in Fiori elements)', async () => {
    assert.equal(await routeOf('catalog', 'Books', { ID: [JANE_EYRE], IsActiveEntity: ['true'] }), `/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
    assert.equal(await routeOf('admin', 'Authors', { ID: [EMILY], IsActiveEntity: ['true'] }), `/Authors(ID='${EMILY}',IsActiveEntity=true)`)
  })

  test('IsActiveEntity=false without such a draft, or a key that finds nothing: the List Report as before', async () => {
    assert.equal(await routeOf('catalog', 'Books', { ID: [JANE_EYRE], IsActiveEntity: ['false'] }), `/Books?f.ID=${JANE_EYRE}`)
    assert.equal(await routeOf('catalog', 'Books', { ID: ['00000000-0000-0000-0000-000000000000'], IsActiveEntity: ['true'] }), `/Books?f.ID=00000000-0000-0000-0000-000000000000`)
  })

  test('the semantic key opens the Object Page of the one book it finds (the active version of a draft root)', async () => {
    assert.equal(await routeOf('catalog', 'Books', { title: ['Jane Eyre'] }), `/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
  })

  test('an unknown parameter is ignored, next to a known one and alone', async () => {
    assert.equal(await routeOf('catalog', 'Books', { title: ['Jane Eyre'], unknownThing: ['1'] }), `/Books(ID='${JANE_EYRE}',IsActiveEntity=true)`)
    assert.equal(await routeOf('catalog', 'Books', { unknownThing: ['1'] }), null)
    assert.equal(await routeOf('catalog', 'Books', {}), null)
  })

  test('a semantic key that finds no book falls back to the filters the other parameters make', async () => {
    assert.equal(await routeOf('catalog', 'Books', { title: ['No Such Book'], author_ID: [EMILY] }), `/Books?f.title=No+Such+Book&f.author_ID=${EMILY}`)
  })

  test('several values of one filter field stay several values of it', async () => {
    assert.equal(await routeOf('catalog', 'Books', { author_ID: [EMILY, JANE_EYRE] }), `/Books?f.author_ID=${EMILY}&f.author_ID=${JANE_EYRE}`)
  })

  test('a draft root without a semantic key (Authors): the technical key filters the List Report', async () => {
    assert.equal(await routeOf('admin', 'Authors', { ID: [EMILY] }), `/Authors?f.ID=${EMILY}`)
  })

  test('the List Report the route names shows the filtered rows', async () => {
    const page = String((await api.GET(`/htmx/catalog${await routeOf('catalog', 'Books', { author_ID: [EMILY] })}`, { headers: HX })).data)
    assert.match(page, /Wuthering Heights/)
    assert.doesNotMatch(page, /Jane Eyre/)
  })

  test('a bad request is refused: an unknown set, parameters that are not JSON, a list instead of an object', async () => {
    assert.equal((await startup('catalog', 'Nowhere', {})).status, 404)
    assert.equal((await api.GET('/htmx/catalog/$startup?set=Books&params=not-json', { headers: HX, validateStatus: () => true })).status, 400)
    assert.equal((await startup('catalog', 'Books', ['a'])).status, 400)
  })
})

describe('the startup parameters, as the shell passes them', () => {
  test('sanitize(): names, strings and sizes; empty values are dropped, a single value is a string', () => {
    assert.deepEqual(sanitize({ a: ['1'], b: ['x', 'y'], c: [''], 'bad name': ['1'], d: 'text', e: [1], __proto__x: ['1'] }), { a: '1', b: ['x', 'y'], d: 'text', __proto__x: '1' })
    assert.equal(sanitize(['a']), undefined)
    assert.equal(sanitize(null), undefined)
    assert.equal(sanitize(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`p${i}`, ['x']]))), undefined)
  })

  test('filterQuery(): only the properties the List Report can filter by', () => {
    const layout = { filterBar: { fields: [{ path: 'author_ID' }], available: [{ path: 'stock' }] } }
    assert.deepEqual(filterQuery(layout, { author_ID: 'a', stock: '5', other: 'x' }), { 'f.author_ID': 'a', 'f.stock': '5' })
  })

  test('semanticValues(): every property of the semantic key needs exactly one value', () => {
    assert.deepEqual(semanticValues({ semanticKey: ['title'] }, { title: 'A' }), { title: 'A' })
    assert.equal(semanticValues({ semanticKey: ['title'] }, { title: ['A', 'B'] }), undefined)
    assert.equal(semanticValues({ semanticKey: ['title', 'year'] }, { title: 'A' }), undefined)
    assert.equal(semanticValues({ semanticKey: [] }, { title: 'A' }), undefined)
    assert.equal(semanticValues({ semanticKey: ['author/name'] }, { 'author/name': 'A' }), undefined)
  })
})
