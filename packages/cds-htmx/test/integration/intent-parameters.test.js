// Intent-based navigation, source side: `GET /$intent` gives the parameters a click on a DataFieldForIntentBasedNavigation passes to the
// target. The reference is the Fiori elements Authors app: on a book's page ("Open Manage Books App") it navigated to
// `#Books-manageHtmx?ID=..&title=Wuthering Heights&stock=12&price=11.50&rating=4.5` -- the properties the page shows and its key (descr,
// author_ID, genre_ID and currency are not on that page, so they are not passed).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const AUTHOR = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001' // Emily Brontë
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000001' // Wuthering Heights
const PAGE = `Authors(ID='${AUTHOR}',IsActiveEntity=true)/books(ID='${BOOK}')`
const intent = (query = {}) => `/htmx/admin/$intent?${new URLSearchParams({ path: PAGE, so: 'Books', action: 'manageHtmx', ...query })}`
const get = (url) => api.GET(url, { headers: HX, validateStatus: () => true })

describe('GET /$intent (the parameters of an intent-based navigation)', () => {
  test('a book page in the Authors app passes what the page shows and its key, as Fiori elements does', async () => {
    const res = await get(intent())
    assert.equal(res.status, 200)
    const plain = { ID: BOOK, title: 'Wuthering Heights', stock: '12', price: '11.50', rating: '4.5' }
    // and, as FE does for a page below another one, each value again under the page's path
    assert.deepEqual(res.data.params, { ...plain, ...Object.fromEntries(Object.entries(plain).map(([name, value]) => [`Authors.books.${name}`, value])) })
  })

  test('no draft or technical properties, and nothing the page does not show', async () => {
    const { params } = (await get(intent())).data
    for (const name of ['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity', 'DraftMessages', 'descr', 'author_ID', 'genre_ID', 'currency_code']) {
      assert.ok(!(name in params), `${name} is not passed`)
    }
  })

  test('an intent the page does not declare is refused (the annotations, not the request, decide)', async () => {
    assert.equal((await get(intent({ action: 'somethingElse' }))).status, 404)
    assert.equal((await get(intent({ so: 'Nothing' }))).status, 404)
  })

  test('a bad request is refused: a missing parameter, an unknown set, a path without keys, an object that does not exist', async () => {
    assert.equal((await get('/htmx/admin/$intent?so=Books&action=manageHtmx')).status, 400)
    assert.equal((await get(intent({ path: "Nowhere(ID='x')" }))).status, 404)
    assert.equal((await get(intent({ path: 'Authors' }))).status, 404)
    assert.equal((await get(intent({ path: `Authors(ID='${AUTHOR}',IsActiveEntity=true)/books(ID='00000000-0000-0000-0000-000000000000')` }))).status, 404)
  })

  test('the book page renders the button with the URL that asks for these parameters', async () => {
    const page = String((await api.GET(`/htmx/admin/${PAGE}`, { headers: HX })).data)
    const button = /<button[^>]*data-hf-intent-object="Books"[^>]*>/.exec(page)?.[0]
    assert.ok(button, 'the intent button is on the page')
    const url = decodeURIComponent(/data-hf-intent-context="([^"]*)"/.exec(button)[1].replace(/&amp;/g, '&'))
    assert.match(url, /\/\$intent\?path=Authors\(ID='9d703c23.*books\(ID='3d2d2d2d.*&so=Books&action=manageHtmx/)
  })
})
