const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

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

    test('Core.Immutable fields are editable while creating (create page, brand-new draft) and read-only afterwards', () => {
      const { isReadOnly } = require('../../lib/render/field')
      const immutable = { path: 'code', immutable: true }
      assert.equal(isReadOnly(immutable, {}, 'create'), false)
      assert.equal(isReadOnly(immutable, { HasActiveEntity: false, IsActiveEntity: false }, 'draft'), false) // new draft
      assert.equal(isReadOnly(immutable, { HasActiveEntity: true, IsActiveEntity: false }, 'draft'), true) // edit of a saved object
      assert.equal(isReadOnly(immutable, {}, 'direct'), true)
      assert.equal(isReadOnly({ path: 'x', computed: true }, {}, 'create'), true)
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
      expect((await call('delete', '/htmx/catalog/Genres(ID=10aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)')).status).to.equal(405)
      expect((await call('get', '/htmx/catalog/Genres')).status).to.equal(200) // still serving
    })

    test("a Genre's page has no Edit and no Delete", async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Genres(ID=10aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)', { headers: HX })
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

    test('a missing mandatory value answers 422 with a message for that field and leaves the page (and what was typed) alone', async () => {
      const { expect } = api
      const res = await api.axios.post('/htmx/catalog/Authors/$save', new URLSearchParams({ name: '', email: 'keep@me.com' }).toString(), { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true })
      expect(res.status).to.equal(422)
      const trigger = JSON.parse(res.headers['hx-trigger'])['hf:messages']
      expect(trigger.set).to.deep.include({ path: 'name', text: 'Provide the missing value.', severity: 'error', label: 'Name' })
      expect(res.data).not.to.include('<input') // nothing to swap: the page keeps the form as typed
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

    test('a composition table is edited inline and saved with the object (rows added, changed and removed)', async () => {
      const { POST, GET, expect } = api
      const form = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } }
      const plain = keysRaw.replace(/'/g, '')
      const awards = async () => (await GET(`/odata/v4/catalog/Authors(${plain})/awards`)).data.value
      const FOREIGN = 'a1a1a1a1-0001-4a4a-8a8a-000000000003' // an award of another author
      const post = fields => POST(`/htmx/catalog/Authors(${keysRaw})/$save`, new URLSearchParams(fields).toString(), form)

      // the edit page has the inputs, the marker, the row template and the buttons
      const edit = await POST(`/htmx/catalog/Authors(${keysRaw})/$edit`, {}, { headers: HX })
      expect(edit.data).to.include('name="awards:present"')
      expect(edit.data).to.include('data-hf-row-template')
      expect(edit.data).to.include('data-hf-action="row-add"')
      expect(edit.data).to.match(/name="awards~__i__\.name"/)
      const display = await GET(`/htmx/catalog/Authors(${keysRaw})`, { headers: HX })
      expect(display.data).not.to.include('data-hf-row-template')

      await post({ name: 'Parity Renamed', 'awards:present': '1', 'awards~a.name': 'First', 'awards~a.year': '2001', 'awards~b.name': 'Second', 'awards~b.year': '2002' })
      let rows = await awards()
      expect(rows.map(r => r.name).sort()).to.deep.equal(['First', 'Second'])

      const first = rows.find(r => r.name === 'First')
      // change one, drop the other, add one; a posted key of somebody else's row is not adopted
      await post({ name: 'Parity Renamed', 'awards:present': '1', 'awards~a.ID': first.ID, 'awards~a.name': 'First Renamed', 'awards~a.year': '2001', 'awards~c.ID': FOREIGN, 'awards~c.name': 'Third', 'awards~c.year': '2003' })
      rows = await awards()
      expect(rows.map(r => r.name).sort()).to.deep.equal(['First Renamed', 'Third'])
      expect(rows.find(r => r.name === 'First Renamed').ID).to.equal(first.ID)
      expect((await GET(`/odata/v4/catalog/Awards(${FOREIGN})`)).data.name).to.equal('Classic of Literature')

      await post({ name: 'Parity Renamed', 'awards:present': '1' }) // every row removed
      expect(await awards()).to.have.length(0)
      await post({ name: 'Parity Renamed' }) // table not part of the form: left alone
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
      expect(res.headers['hx-replace-url']).to.equal('/htmx/catalog/Authors')
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
      draftRaw = edited.headers['hx-replace-url'].match(/Books\((.*)\)/)[1]
      expect(edited.data).to.include('data-hf-popover-toggle')
      expect(edited.data).to.match(/hx-get="\/htmx\/catalog\/Books\(ID='[^']*',IsActiveEntity=true\)"/) // Saved Version
      const savedVersion = await GET(`/htmx/catalog/Books(${BOOK})`, { headers: HX })
      expect(savedVersion.data).to.include('Saved Version')
      expect(savedVersion.data).to.match(/hx-get="\/htmx\/catalog\/Books\(ID='[^']*',IsActiveEntity=false\)"/) // switch to Draft
      expect(savedVersion.data).not.to.match(/aria-label="Edit"/) // a draft exists
    })

    test('the List Report shows the draft indicator under the Common.SemanticKey column only', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Books', { headers: HX })
      const cells = res.data.match(/<td class="[^"]*hf-col-\d+[^"]*">(?:(?!<\/td>)[\s\S])*hf-draft-indicator(?:(?!<\/td>)[\s\S])*<\/td>/g) || []
      expect(cells.length).to.be.greaterThan(0)
      for (const cell of cells) expect(cell).to.match(/hf-col-0\b/) // title is the semantic key and the first column
      const { rowMarkup } = require('../../lib/render/table')
      const row = { ID: 'x', title: 'T', IsActiveEntity: false, HasDraftEntity: false }
      const layout = { table: { columns: [{ kind: 'UI.DataField', field: { path: 'title', cqlPath: 'title' } }] }, semanticKey: [] }
      const render = semanticKey => String(rowMarkup({ ...layout, semanticKey }, row, { basePath: '/htmx/catalog', entitySetPath: 'Books', keyNames: ['ID'], bundle: {}, t: () => 'Draft', numeric: [false], selectable: true }))
      expect(render([])).not.to.include('hf-draft-indicator') // no semantic key: FE shows no indicator
      expect(render(['title'])).to.include('hf-draft-indicator')
    })

    test('"Add Filter": any other property can filter, technical and annotated ones are not offered', async () => {
      const { GET, expect } = api
      const page = await GET('/htmx/catalog/Books', { headers: HX })
      const available = JSON.parse(page.data.match(/data-hf-available="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
      const paths = available.map(f => f.path)
      expect(paths).to.include('price')
      expect(paths).not.to.include('genre_ID') // already a SelectionField
      expect(paths).not.to.include('IsActiveEntity')
      // the table body holds one page of the rows: the total is in the count the response refreshes
      const total = res => Number(/hx-target="#lr-count"[^>]*>([\d,]+)</.exec(res.data)[1].replace(/,/g, ''))
      const all = await GET('/htmx/catalog/Books/$table', { headers: HX })
      const filtered = await GET('/htmx/catalog/Books/$table?f.price=>10', { headers: HX })
      expect(total(filtered)).to.be.lessThan(total(all))
      const unknown = await GET('/htmx/catalog/Books/$table?f.nonsense=1', { headers: HX })
      expect(total(unknown)).to.equal(total(all))
    })

    test('Edit on an object that already has your own draft resumes it', async () => {
      const { POST, expect } = api
      const res = await POST(`/htmx/catalog/Books(${BOOK})/$edit`, {}, { headers: HX })
      expect(res.status).to.equal(200)
      expect(res.headers['hx-replace-url']).to.include('IsActiveEntity=false')
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

  describe('value help dialog', () => {
    const open = (url, headers = {}) => api.axios.get(url, { headers: { ...HX, ...headers } })

    test('opens as a modal "Select: <label>" with the value list columns and one row per entry', async () => {
      const res = await open('/htmx/catalog/Books/$vh/author_ID')
      assert.equal(res.status, 200)
      assert.match(res.data, /class="hf-overlay" data-hf-dialog/)
      assert.match(res.data, /Select: [^<]+/)
      assert.match(res.data, /<th role="columnheader">ID<\/th>/)
      assert.match(res.data, /<th role="columnheader">Name<\/th>/)
      assert.equal((res.data.match(/class="[^"]*hf-vh-row/g) || []).length, 4)
      assert.match(res.data, /Items \(4\)/)
      assert.match(res.data, /data-hf-dialog-close/)
    })

    test('type-ahead mode returns the popup with the key in brackets and "Show All Items"', async () => {
      const res = await open('/htmx/catalog/Books/$vh/author_ID?mode=suggest&$search=Poe')
      assert.equal(res.status, 200)
      assert.doesNotMatch(res.data, /hf-overlay/)
      assert.match(res.data, /<th>\[ID\]<\/th>/)
      assert.match(res.data, /Edgar Allan Poe/)
      assert.doesNotMatch(res.data, /Emily/)
      assert.match(res.data, /data-hf-show-all/)
    })

    test('searching only replaces the results (the table), never the whole dialog', async () => {
      const res = await open('/htmx/catalog/Books/$vh/author_ID?$search=Poe', { 'HX-Target': 'div#vh-results' })
      assert.doesNotMatch(res.data, /hf-overlay/)
      assert.match(res.data, /Items \(1\)/)
      assert.match(res.data, /Edgar Allan Poe/)
    })

    test('the field opens it with a button (and F4 in the page script), into the dialogs container', async () => {
      const key = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000004'"
      const edit = await api.axios.post(`/htmx/catalog/Books(${key},IsActiveEntity=true)/$edit`, {}, { headers: HX })
      try {
        assert.match(edit.data, /class="[^"]*hf-vh-open"[\s\S]*?hx-get="[^"]*\/\$vh\/author_ID"[\s\S]*?hx-target="#dialogs"/)
      } finally {
        await api.axios.post(`/htmx/catalog/Books(${key},IsActiveEntity=false)/$discard`, {}, { headers: HX })
      }
    })
  })

  describe('composition children in a draft (Books.chapters)', () => {
    const JANE = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000002'"
    const CH1 = "ID='7c7c7c7c-0002-4a4a-8a8a-000000000001',IsActiveEntity=false"
    const form = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } }
    const activeChapters = async () => (await api.axios.get(`/odata/v4/catalog/Books(ID=3d2d2d2d-1c1c-4b4b-8a8a-000000000002,IsActiveEntity=true)/chapters`)).data.value.length
    let page
    const rowPatches = html => (html.match(/hx-patch="[^"]*\/chapters\([^"]*\/\$field\/title"/g) || []).length

    before(async () => {
      page = (await api.axios.post(`/htmx/catalog/Books(${JANE},IsActiveEntity=true)/$edit`, {}, { headers: HX })).data
    })
    after(async () => {
      await api.axios.post(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/$discard`, {}, { headers: HX }).catch(() => {})
    })

    test('rows are inputs that PATCH the child draft, rows navigate only via the arrow, the mandatory header is marked', () => {
      assert.match(page, /<td[^>]*data-hf-field="chapters\(ID=(?:'|&#39;)7c7c7c7c-0002-4a4a-8a8a-000000000001(?:'|&#39;),IsActiveEntity=false\)\.title"/)
      assert.match(page, /hx-patch="[^"]*\/chapters\(ID=(?:'|&#39;)7c7c7c7c-0002-4a4a-8a8a-000000000001(?:'|&#39;),IsActiveEntity=false\)\/\$field\/title"/)
      assert.match(page, /<tr [^>]*hx-trigger="click"/)
      assert.match(page, /hf-field__required/)
    })

    test('a cell change patches only the child draft and answers with a (cleared) message state', async () => {
      const res = await api.axios.patch(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters(${CH1})/$field/title`, 'title=Edited', form)
      assert.equal(res.status, 200)
      assert.deepEqual(JSON.parse(res.headers['hx-trigger'])['hf:messages'].set, [])
      assert.match(res.data, /Draft saved/)
      const draft = await api.axios.get(`/odata/v4/catalog/Books(ID=3d2d2d2d-1c1c-4b4b-8a8a-000000000002,IsActiveEntity=false)/chapters(ID=7c7c7c7c-0002-4a4a-8a8a-000000000001,IsActiveEntity=false)`)
      assert.equal(draft.data.title, 'Edited')
      assert.equal((await api.axios.get(`/odata/v4/catalog/Chapters(ID=7c7c7c7c-0002-4a4a-8a8a-000000000001,IsActiveEntity=true)`)).data.title, 'I. Gateshead', 'the saved chapter is untouched')
    })

    test('pasted rows create one child draft per row, and nothing when a cell is invalid', async () => {
      assert.match(page, /data-hf-paste-path="title"/)
      assert.match(page, /data-hf-action="paste"/)
      const url = `/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters/$paste`
      const send = rows => api.axios.post(url, new URLSearchParams({ cols: JSON.stringify(['title', 'pages']), rows: JSON.stringify(rows) }).toString(), { ...form, validateStatus: () => true })
      const count = async () => (await api.axios.get(`/odata/v4/catalog/Books(ID=3d2d2d2d-1c1c-4b4b-8a8a-000000000002,IsActiveEntity=false)/chapters`)).data.value.length
      const before = await count()
      const bad = await send([['Pasted A', '10'], ['Pasted B', 'ten']])
      assert.equal(bad.status, 422)
      assert.equal(await count(), before, 'nothing created')
      const ok = await send([['Pasted A', '10'], ['Pasted B', '20']])
      assert.equal(ok.status, 200)
      assert.equal(await count(), before + 2)
      assert.match(ok.data, /Pasted A/)
      assert.equal((await send([['x']].concat(Array(201).fill(['y'])))).status, 400, 'too many rows')
      // clean up: the later tests count the chapters
      const drafts = (await api.axios.get(`/odata/v4/catalog/Books(ID=3d2d2d2d-1c1c-4b4b-8a8a-000000000002,IsActiveEntity=false)/chapters`)).data.value.filter(c => /^Pasted/.test(c.title))
      for (const c of drafts) await api.axios.delete(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters(ID='${c.ID}',IsActiveEntity=false)`, { headers: HX })
      assert.equal(await count(), before)
    })

    test('an emptied mandatory cell is flagged on exactly that cell', async () => {
      const res = await api.axios.patch(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters(${CH1})/$field/title`, 'title=', form)
      const { set, clear } = JSON.parse(res.headers['hx-trigger'])['hf:messages']
      assert.equal(set.length, 1)
      assert.equal(set[0].path, `chapters(${CH1}).title`)
      assert.equal(set[0].text, 'Provide the missing value.')
      assert.deepEqual(clear, [`chapters(${CH1}).title`])
      await api.axios.patch(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters(${CH1})/$field/title`, 'title=I.%20Gateshead', form)
    })

    test('Create makes a child draft linked to the book and opens its own page (Apply, Delete, New Chapter)', async () => {
      const res = await api.axios.post(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters`, {}, { headers: HX })
      assert.equal(res.status, 200)
      assert.match(res.headers['hx-push-url'], /\/htmx\/catalog\/Books\(ID='[^']*',IsActiveEntity=false\)\/chapters\(ID='[0-9a-f-]{36}',IsActiveEntity=false\)$/)
      assert.match(res.data, /New Chapter/)
      assert.match(res.data, />Apply</)
      assert.doesNotMatch(res.data, />Save</)
      assert.match(res.data, /hx-delete="[^"]*\/chapters\([^"]*"/) // Delete of the child row
      const childPath = res.headers['hx-push-url']
      // the child belongs to the book: the book page lists it
      const book = await api.axios.get(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)`, { headers: HX })
      assert.equal(rowPatches(book.data), 3)
      // typing in its page field: header title, validation, no URL (partials in the response)
      const source = 'op-field--ChapterInfo--title'
      const patched = await api.axios.patch(childPath.replace('/htmx/catalog', '/htmx/catalog') + '/$field/title', 'title=Typed%20title', { headers: { ...form.headers, 'X-Hf-Source': source } })
      assert.match(patched.data, /hx-target="#op-title"[\s\S]*Typed title/)
      // delete the child again (CANCEL of the child draft), back on the book
      const removed = await api.axios.delete(childPath, { headers: HX })
      assert.equal(removed.headers['hx-replace-url'], `/htmx/catalog/Books(${JANE},IsActiveEntity=false)`)
      assert.equal(rowPatches((await api.axios.get(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)`, { headers: HX })).data), 2)
    })

    test('bulk delete cancels the ticked child drafts only; discarding the book leaves every saved chapter', async () => {
      const body = new URLSearchParams([['keys', CH1]]).toString()
      const res = await api.axios.post(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/chapters/$delete`, body, form)
      assert.equal(res.status, 200)
      assert.equal(rowPatches((await api.axios.get(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)`, { headers: HX })).data), 1)
      assert.equal(await activeChapters(), 2, 'nothing of the saved data was deleted')
      await api.axios.post(`/htmx/catalog/Books(${JANE},IsActiveEntity=false)/$discard`, {}, { headers: HX })
      assert.equal(await activeChapters(), 2)
    })

    test('children are only editable through a draft root', async () => {
      const bad = await api.axios.post('/htmx/catalog/Authors/books', {}, { headers: HX, validateStatus: () => true })
      assert.ok([404, 405].includes(bad.status))
      const noDraft = await api.axios.patch(`/htmx/catalog/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0001')/books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001')/$field/title`, 'title=x', { ...form, validateStatus: () => true })
      assert.ok([404, 405].includes(noDraft.status))
    })
  })

  describe('table tools: export, view settings hooks, adapt filters, filter value help', () => {
    const get = (url, headers = {}) => api.axios.get(url, { headers: { ...HX, ...headers } })

    test('the List Report carries the hooks the page script needs (view key, settings, export, adapt filters, saved views)', async () => {
      const page = (await get('/htmx/catalog/Books')).data
      assert.match(page, /data-hf-set="Books"/)
      assert.match(page, /class="hf-table-card" data-hf-view="lr:Books"/)
      assert.match(page, /data-hf-action="settings"/)
      assert.match(page, /data-hf-action="export" data-hf-export="\/htmx\/catalog\/Books\/\$export"/)
      assert.match(page, /data-hf-action="adapt-filters"/)
      assert.match(page, /id="hf-variants"[\s\S]*data-hf-variant-list/)
      assert.match(page, /<th[^>]*data-hf-sort="stock"[^>]*data-hf-label="Stock"/)
      assert.match(page, /data-hf-filter="author_ID" data-hf-label="Author"/)
    })

    test('a full page brings the dialog texts (in the request locale) as JSON', async () => {
      const full = (await api.axios.get('/htmx/catalog/Books')).data
      const json = JSON.parse(/<script type="application\/json" id="hf-texts">([\s\S]*?)<\/script>/.exec(full)[1])
      assert.equal(json.ViewSettings, 'View Settings')
      assert.equal(json.AdaptFilters, 'Adapt Filters')
      assert.match(full, /htmx-tables\.js/)
    })

    test('filter fields with a value list open the value help for their own filter input', async () => {
      const page = (await get('/htmx/catalog/Books')).data
      assert.match(page, /hx-get="\/htmx\/catalog\/Books\/\$vh\/author_ID\?target=f\.author_ID"/)
      const dialog = (await get('/htmx/catalog/Books/$vh/author_ID?target=f.author_ID')).data
      assert.match(dialog, /data-hf-target="f\.author_ID"/)
      assert.match(dialog, /\$vh\/author_ID\?target=f\.author_ID/) // searching keeps the target
      // anything that is not a plain name falls back to the field itself
      assert.match((await get('/htmx/catalog/Books/$vh/author_ID?target=%22%3E%3Cscript')).data, /data-hf-target="author_ID"/)
    })

    test('a table section has a search box, export and view settings; its view key names the child type', async () => {
      const page = (await get("/htmx/catalog/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000002',IsActiveEntity=true)")).data
      assert.match(page, /data-hf-view="section:CatalogService\.Chapters:Chapters"/)
      assert.match(page, /data-hf-table-search/)
      assert.match(page, /data-hf-action="export-dom" data-hf-filename="Chapters"/)
      assert.match(page, /data-hf-action="settings"/)
    })

    test('$export answers a CSV file: BOM, header, every matching row, the displayed values', async () => {
      const res = await get('/htmx/catalog/Books/$export')
      assert.equal(res.status, 200)
      assert.match(res.headers['content-type'], /^text\/csv; charset=utf-8/)
      assert.match(res.headers['content-disposition'], /attachment; filename="Books\.csv"; filename\*=UTF-8''Books\.csv/)
      // the UTF-8 BOM (EF BB BF) makes Excel read the file as UTF-8; HTTP clients strip it from the decoded text
      const raw = await api.axios.get('/htmx/catalog/Books/$export', { headers: HX, responseType: 'arraybuffer' })
      assert.deepEqual([...Buffer.from(raw.data).subarray(0, 3)], [0xEF, 0xBB, 0xBF])
      const lines = res.data.trim().split('\r\n')
      assert.equal(lines.length, 1006, 'the header and all 1005 books, although a query returns at most 1000 rows')
      assert.match(lines[0], /^Book Title \(XML override\),Stock,Status,Author,Price$/)
      assert.ok(lines.some(l => /^Wuthering Heights,12,In Stock,Emily Brontë,11\.50 EUR$/.test(l)), lines.join('\n'))
    })

    test('$export follows the page state: filters, search, sort and the visible columns', async () => {
      const poe = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003'
      const filtered = await get(`/htmx/catalog/Books/$export?f.author_ID=${poe}&cols=0,4&$orderby=price%20desc`)
      const lines = filtered.data.trim().split('\r\n')
      const expected = (await api.GET(`/odata/v4/catalog/Books/$count?$filter=author_ID eq ${poe}`)).data
      assert.equal(lines.length, Number(expected) + 1, 'every book by Poe plus the header')
      assert.match(lines[0], /^Book Title \(XML override\),Price$/)
      const prices = lines.slice(1).map(l => Number(/,(\d+\.\d+) \w+$/.exec(l)[1]))
      assert.deepEqual(prices, [...prices].sort((a, b) => b - a), 'price descending')
      assert.ok(lines.some(l => /^Eleonora,6\.75 USD$/.test(l)) && lines.some(l => /^The Raven,4\.50 USD$/.test(l)))
      const searched = await get('/htmx/catalog/Books/$export?$search=Raven')
      assert.equal(searched.data.trim().split('\r\n').length, 2)
    })

    test('$export quotes what needs quoting and defuses spreadsheet formulas', async () => {
      const { POST } = api
      const created = (await POST('/odata/v4/catalog/Authors', { name: '=1+1,"x"' })).data
      try {
        const csv = (await get('/htmx/catalog/Authors/$export?$search=1%2B1')).data
        assert.match(csv, /"'=1\+1,""x"""/)
      } finally {
        await api.axios.delete(`/odata/v4/catalog/Authors(${created.ID})`)
      }
    })

    test('$export is not offered for a draft node on its own', async () => {
      assert.equal((await api.axios.get('/htmx/catalog/Chapters/$export', { headers: HX, validateStatus: () => true })).status, 405)
    })
  })

  describe('navigation and history', () => {
    test('switching between saved and draft version replaces the history entry (Back after Edit goes to the list); opening a new page pushes', async () => {
      const key = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000004'"
      const post = (url, body = {}) => api.axios.post(url, body, { headers: HX })
      const edit = await post(`/htmx/catalog/Books(${key},IsActiveEntity=true)/$edit`)
      assert.match(edit.headers['hx-replace-url'], /IsActiveEntity=false/)
      assert.equal(edit.headers['hx-push-url'], undefined)
      const saved = await post(`/htmx/catalog/Books(${key},IsActiveEntity=false)/$save`)
      assert.match(saved.headers['hx-replace-url'], /IsActiveEntity=true/)
      assert.equal(saved.headers['hx-push-url'], undefined)
      await post(`/htmx/catalog/Books(${key},IsActiveEntity=true)/$edit`)
      const discarded = await post(`/htmx/catalog/Books(${key},IsActiveEntity=false)/$discard`)
      assert.match(discarded.headers['hx-replace-url'], /IsActiveEntity=true/)
      assert.equal(discarded.headers['hx-push-url'], undefined)
      // the version switch in the draft marker is a replace as well
      const page = await post(`/htmx/catalog/Books(${key},IsActiveEntity=true)/$edit`)
      assert.match(page.data, /class="hf-popover__item" hx-get="[^"]*IsActiveEntity=true\)" hx-target="#app" hx-replace-url="true"/)
      // a brand-new draft is a new page (push); discarding it goes back to the list in place
      const created = await post('/htmx/catalog/Books')
      assert.ok(created.headers['hx-push-url'])
      const raw = created.headers['hx-push-url'].match(/Books\((.*)\)/)[1]
      const gone = await post(`/htmx/catalog/Books(${raw})/$discard`)
      assert.equal(gone.headers['hx-replace-url'], '/htmx/catalog/Books')
      await post(`/htmx/catalog/Books(${key},IsActiveEntity=false)/$discard`)
    })

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
