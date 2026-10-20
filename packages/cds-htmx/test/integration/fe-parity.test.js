const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { editCapabilities, canCreate, canEdit, canDelete } = require('../../lib/model/edit-capabilities')
const { coerce, InputError } = require('../../lib/data/form')
const cache = require('../../lib/model/cache')

const HX = { 'HX-Request': 'true' }
const BOOK = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000004',IsActiveEntity=true" // Eleonora
const BOOK_DRAFT = BOOK.replace('true', 'false')
const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const storeOf = () => cache.storeFor(cds.model, 'CatalogService', '/odata/v4/catalog/', { appRoot: root })

describe('FE parity: capabilities, direct editing, history, confirmations (round 1)', () => {

  describe('what an entity allows', () => {
    test('draft root, draft node, @readonly and plain entities are told apart', () => {
      const books = editCapabilities(storeOf(), 'CatalogService.Books')
      const chapters = editCapabilities(storeOf(), 'CatalogService.Chapters')
      const genres = editCapabilities(storeOf(), 'CatalogService.Genres')
      const authors = editCapabilities(storeOf(), 'CatalogService.Authors')
      assert.equal(books.mode, 'draft')
      assert.equal(chapters.mode, 'node')
      assert.equal(authors.mode, 'direct')
      assert.equal(genres.mode, 'direct')
      assert.deepEqual([canCreate(books), canEdit(books, {}), canDelete(books, {})], [true, true, true])
      assert.deepEqual([canCreate(authors), canEdit(authors, {}), canDelete(authors, {})], [true, true, true])
      assert.deepEqual([canCreate(genres), canEdit(genres, {}), canDelete(genres, {})], [false, false, false], '@readonly')
      assert.deepEqual([canCreate(chapters), canEdit(chapters, {}), canDelete(chapters, {})], [false, false, false], 'a draft node is only editable inside its root')
    })

    test('path-based restrictions are evaluated per object', () => {
      const edit = { mode: 'direct', insertable: true, updatable: { $Path: 'editable' }, deletable: true }
      assert.equal(canEdit(edit, { editable: true }), true)
      assert.equal(canEdit(edit, { editable: false }), false)
    })

    test('form values are converted to their element types; bad input is an InputError', () => {
      assert.equal(coerce({ type: 'cds.Integer' }, '42', 'Stock'), 42)
      assert.equal(coerce({ type: 'cds.Integer' }, '', 'Stock'), null)
      assert.equal(coerce({ type: 'cds.Decimal' }, '9.99', 'Price'), '9.99')
      assert.equal(coerce({ type: 'cds.Boolean' }, 'on', 'Flag'), true)
      assert.equal(coerce({ type: 'cds.Boolean' }, undefined, 'Flag'), undefined)
      assert.equal(coerce({ type: 'cds.String' }, 'text', 'Name'), 'text')
      assert.throws(() => coerce({ type: 'cds.Integer' }, 'abc', 'Stock'), InputError)
    })
  })

  describe('@readonly entity (Genres)', () => {
    test('the List Report offers neither Create nor Delete nor row selection', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Genres', { headers: HX })
      expect(res.data).not.to.match(/aria-label="Create"/)
      expect(res.data).not.to.match(/aria-label="Delete"/)
      expect(res.data).not.to.match(/hf-checkbox/)
    })

    test('posting a create/edit/delete/save is refused and never reaches the draft runtime (no crash)', async () => {
      const { expect } = api
      const call = (method, url) => api.axios.request({ method, url, headers: HX, ...(method === 'get' ? {} : { data: {} }), validateStatus: () => true })
      expect((await call('post', '/htmx/catalog/Genres')).status).to.equal(405)
      expect((await call('get', '/htmx/catalog/Genres/$new')).status).to.equal(405)
      expect((await call('post', '/htmx/catalog/Genres/$save')).status).to.equal(405)
      expect((await call('post', '/htmx/catalog/Genres/$delete')).status).to.equal(405)
      expect((await call('delete', '/htmx/catalog/Genres(ID=1)')).status).to.equal(405)
      expect((await call('get', '/htmx/catalog/Genres')).status).to.equal(200) // still serving
    })

    test("a Genre's page has no Edit and no Delete", async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Genres(ID=1)', { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.data).not.to.match(/aria-label="Edit"/)
      expect(res.data).not.to.match(/aria-label="Delete"/)
    })
  })

  describe('non-draft entity (Authors) is edited directly', () => {
    let keysRaw
    const created = []

    test('Create opens an empty form without storing anything or pushing a URL', async () => {
      const { GET, expect } = api
      const before = (await GET('/odata/v4/catalog/Authors?$count=true&$top=0'))['data']['@odata.count']
      const res = await GET('/htmx/catalog/Authors/$new', { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-push-url']).to.equal(undefined)
      expect(res.data).to.match(/<input type="text" class="fd-input"[^>]*name="name"/)
      expect(res.data).not.to.match(/hx-patch=/) // nothing is patched while typing
      expect(res.data).to.match(/hx-post="\/htmx\/catalog\/Authors\/\$save"[^>]*hx-include="#op-page"/)
      expect((await GET('/odata/v4/catalog/Authors?$count=true&$top=0'))['data']['@odata.count']).to.equal(before)
    })

    test('Create posts the form: the new Author exists and its page is shown with a toast', async () => {
      const { POST, GET, expect } = api
      const res = await POST('/htmx/catalog/Authors/$save', new URLSearchParams({ name: 'Parity Author', email: 'p@example.com' }).toString(), { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-push-url']).to.match(/^\/htmx\/catalog\/Authors\(ID='[0-9a-f-]{36}'\)$/)
      expect(res.data).to.include('Parity Author')
      expect(res.data).to.include('Object created.')
      keysRaw = res.headers['hx-push-url'].match(/Authors\((.*)\)/)[1]
      created.push(keysRaw)
      const odata = await GET(`/odata/v4/catalog/Authors(${keysRaw.replace(/'/g, '')})`)
      expect(odata.data.email).to.equal('p@example.com')
    })

    test('a missing mandatory value re-shows the form as typed with the message (422)', async () => {
      const { expect } = api
      const res = await api.axios.post('/htmx/catalog/Authors/$save', new URLSearchParams({ name: '', email: 'keep@me.com' }).toString(), { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true })
      expect(res.status).to.equal(422)
      expect(res.data).to.include('keep@me.com')
      expect(res.data).to.match(/hx-target="#messages"/)
    })

    test('Edit shows the same page in edit mode: no draft, no URL', async () => {
      const { POST, expect } = api
      const res = await POST(`/htmx/catalog/Authors(${keysRaw})/$edit`, {}, { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-push-url']).to.equal(undefined)
      expect(res.data).to.match(/name="name"[^>]*value="Parity Author"|value="Parity Author"[^>]*name="name"|name="name" value="Parity Author"/)
      expect(res.data).to.match(/hx-post="[^"]*\$save"[^>]*hx-include="#op-page"/)
      expect(res.data).to.include('>Cancel<')
    })

    test('Save PATCHes the active entity; Cancel changes nothing', async () => {
      const { POST, GET, expect } = api
      const form = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } }
      const saved = await POST(`/htmx/catalog/Authors(${keysRaw})/$save`, new URLSearchParams({ name: 'Parity Renamed', email: 'p@example.com' }).toString(), form)
      expect(saved.data).to.include('Parity Renamed')
      expect(saved.data).to.include('Object saved.')
      const cancelled = await POST(`/htmx/catalog/Authors(${keysRaw})/$discard`, {}, { headers: HX })
      expect(cancelled.data).to.include('Parity Renamed')
      expect((await GET(`/odata/v4/catalog/Authors(${keysRaw.replace(/'/g, '')})`)).data.name).to.equal('Parity Renamed')
    })

    test('the Delete button carries a confirmation the client shows as a UI dialog', async () => {
      const { GET, expect } = api
      const res = await GET(`/htmx/catalog/Authors(${keysRaw})`, { headers: HX })
      expect(res.data).to.match(/hx-delete="[^"]*"[^>]*hx-confirm="Delete this object\?"/)
      expect(res.data).to.include('data-hf-confirm-critical')
    })

    test('DELETE removes it and answers with the List Report and a toast', async () => {
      const { expect } = api
      const res = await api.axios.delete(`/htmx/catalog/Authors(${keysRaw})`, { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-push-url']).to.equal('/htmx/catalog/Authors')
      expect(res.data).to.include('Object deleted.')
      expect((await api.axios.get(`/odata/v4/catalog/Authors(${keysRaw.replace(/'/g, '')})`, { validateStatus: () => true })).status).to.equal(404)
    })

    test('List Report Delete removes every ticked row', async () => {
      const { POST, GET, expect } = api
      const ids = []
      for (const name of ['Bulk 1', 'Bulk 2']) ids.push((await POST('/odata/v4/catalog/Authors', { name })).data.ID)
      const body = new URLSearchParams(); ids.forEach(id => body.append('keys', `ID='${id}'`))
      const res = await POST('/htmx/catalog/Authors/$delete', body.toString(), { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } })
      expect(res.status).to.equal(200)
      for (const id of ids) expect((await api.axios.get(`/odata/v4/catalog/Authors(${id})`, { validateStatus: () => true })).status).to.equal(404)
      expect((await GET('/htmx/catalog/Authors', { headers: HX })).data).to.include('data-hf-needs-selection')
    })
  })

  describe('draft root (Books)', () => {
    let draftRaw
    test('a draft marker with a switch popover appears only where there is something to switch to', async () => {
      const { GET, POST, expect } = api
      const display = await GET(`/htmx/catalog/Books(${BOOK})`, { headers: HX })
      expect(display.data).not.to.include('data-hf-popover-toggle')
      const edited = await POST(`/htmx/catalog/Books(${BOOK})/$edit`, {}, { headers: HX })
      draftRaw = edited.headers['hx-push-url'].match(/Books\((.*)\)/)[1]
      expect(edited.data).to.include('data-hf-popover-toggle')
      expect(edited.data).to.match(/hx-get="\/htmx\/catalog\/Books\(ID='[^']*',IsActiveEntity=true\)"/) // Saved Version
      const savedVersion = await GET(`/htmx/catalog/Books(${BOOK})`, { headers: HX })
      expect(savedVersion.data).to.include('Saved Version')
      expect(savedVersion.data).to.match(/hx-get="\/htmx\/catalog\/Books\(ID='[^']*',IsActiveEntity=false\)"/) // switch to Draft
      expect(savedVersion.data).not.to.match(/aria-label="Edit"/) // a draft exists
    })

    test('Edit on an object that already has your own draft resumes it', async () => {
      const { POST, expect } = api
      const res = await POST(`/htmx/catalog/Books(${BOOK})/$edit`, {}, { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-push-url']).to.include('IsActiveEntity=false')
    })

    test('typing in a field never pushes a URL and the response updates the header title', async () => {
      const { PATCH, GET, expect } = api
      const page = await GET(`/htmx/catalog/Books(${BOOK_DRAFT})`, { headers: HX })
      expect(page.data).to.match(/name="title"[^>]*hx-push-url="false"/)
      expect(page.data).to.match(/name="title"[^>]*hx-swap="none"/)
      const res = await PATCH(`/htmx/catalog/Books(${BOOK_DRAFT})/$field/title`, { title: 'Eleonora Live' }, { headers: { ...HX, 'X-Hf-Source': 'op-field--GeneralInfo--title' } })
      expect(res.status).to.equal(200)
      expect(res.data).to.match(/<hx-partial hx-target="#op-title"[^>]*>[\s\S]*Eleonora Live/)
      expect(res.data).not.to.match(/hx-target="#op-field--GeneralInfo--title"/) // the field being typed in is left alone
    })

    test('discard asks for confirmation', async () => {
      const { GET, expect } = api
      const res = await GET(`/htmx/catalog/Books(${BOOK_DRAFT})`, { headers: HX })
      expect(res.data).to.match(/hx-post="[^"]*\$discard"[\s\S]*?hx-confirm="Discard all changes to this object\?"/)
    })

    test('after the draft is discarded its URL shows the saved version (history) instead of failing', async () => {
      const { POST, GET, expect } = api
      await POST(`/htmx/catalog/Books(${BOOK_DRAFT})/$discard`, {}, { headers: HX })
      const full = await api.axios.get(`/htmx/catalog/Books(${BOOK_DRAFT})`, { maxRedirects: 0, validateStatus: () => true })
      expect(full.status).to.equal(302)
      expect(full.headers.location).to.equal(`/htmx/catalog/Books(${BOOK})`)
      const fragment = await GET(`/htmx/catalog/Books(${BOOK_DRAFT})`, { headers: HX })
      expect(fragment.headers['hx-replace-url']).to.equal(`/htmx/catalog/Books(${BOOK})`)
      expect(fragment.data).to.include('Eleonora')
    })

    test('an object that does not exist at all answers 404 with a way back', async () => {
      const { expect } = api
      const res = await api.axios.get("/htmx/catalog/Books(ID='00000000-0000-0000-0000-000000000000',IsActiveEntity=true)", { headers: HX, validateStatus: () => true })
      expect(res.status).to.equal(404)
      expect(res.data).to.include('/htmx/catalog/Books')
    })
  })

  describe('navigation and history', () => {
    test('the pages no longer inherit "push the URL" from #app; rows and links push explicitly', async () => {
      const { GET, expect } = api
      const page = await GET('/htmx/catalog/Books')
      expect(page.data).to.match(/<div id="app">/)
      expect(page.data).not.to.include('hx-push-url:inherited')
      expect(page.data).to.match(/<tr id="lr-row--[^"]*"[^>]*hx-get="[^"]*"[\s\S]*?hx-push-url="true"/)
    })

    test('$table pushes nothing: the filter state is replaced into the List Report URL', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Books/$table?$search=Raven&f.EditingStatus=ALL&f.author_ID=', { headers: HX })
      expect(res.headers['hx-replace-url']).to.equal('/htmx/catalog/Books?%24search=Raven')
      const more = await GET('/htmx/catalog/Books/$table?$skip=20', { headers: HX })
      expect(more.headers['hx-replace-url']).to.equal(undefined) // growing does not change the URL
    })

    test('reloading a $table URL (document navigation) shows the List Report, not bare rows', async () => {
      const { expect } = api
      const res = await api.axios.get('/htmx/catalog/Books/$table?$search=Raven', { headers: { 'Sec-Fetch-Dest': 'document' }, maxRedirects: 0, validateStatus: () => true })
      expect(res.status).to.equal(302)
      expect(res.headers.location).to.equal('/htmx/catalog/Books?%24search=Raven')
    })

    test('a page replaces stale message strips; a failing action leaves the page alone', async () => {
      const { GET, expect } = api
      const page = await GET('/htmx/catalog/Authors', { headers: HX })
      expect(page.data).to.match(/<hx-partial hx-target="#messages" hx-swap="outerHTML"><div id="messages"><\/div><\/hx-partial>/)
    })
  })

  describe('SSE playground (dev)', () => {
    test('lists pages and actions; the action runs and a missing one is 404', async () => {
      const { GET, POST, expect } = api
      const page = await GET('/htmx/catalog/$playground')
      expect(page.status).to.equal(200)
      expect(page.data).to.include('simulateDelivery')
      expect(page.data).to.include('htmx-playground.js')
      expect(page.data).to.match(/Books \(List Report\)/)
      const clients = await GET('/htmx/catalog/$playground/clients')
      expect(clients.status).to.equal(200)
      const ran = await POST('/htmx/catalog/$playground/action/simulateDelivery', new URLSearchParams({ book: '3d2d2d2d-1c1c-4b4b-8a8a-000000000001', qty: '0' }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      expect(ran.data).to.match(/^ok/)
      expect((await api.axios.post('/htmx/catalog/$playground/action/nope', {}, { validateStatus: () => true })).status).to.equal(404)
    })

    test('is not served in production', async () => {
      const { expect } = api
      const was = cds.env.production
      cds.env.production = true
      try {
        expect((await api.axios.get('/htmx/catalog/$playground', { validateStatus: () => true })).status).to.equal(404)
      } finally { cds.env.production = was }
    })
  })
})
