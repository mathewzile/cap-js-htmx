// A table section offers what its target entity and the parent's NavigationRestrictions allow (FE reads the same annotations):
// inputs for updatable, Delete for deletable, Create and paste for insertable compositions.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const cache = require('../../lib/model/cache')
const { sectionCapabilities } = require('../../lib/model/object-page')

const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const HX = { 'HX-Request': 'true' }
const FORM = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } }
const POE = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003'
const DRAFT = `/htmx/admin/Authors(ID='${POE}',IsActiveEntity=false)`
const section = (html, id) => new RegExp(`<section id="op-section--${id}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? ''

describe('section capabilities', () => {
  let real
  before(() => { real = cache.storeFor(cds.model, 'AdminService', '/admin/', { appRoot: root }) })
  const withRaw = (extra) => Object.assign(Object.create(real), { raw: t => ({ ...real.raw(t), ...(extra[t] || {}) }) })

  test('a read-only target (@readonly Books) allows nothing, a draft node and a plain composition everything', () => {
    assert.deepEqual(sectionCapabilities(real, 'AdminService.Authors', 'books', 'AdminService.Books'), { insertable: false, updatable: false, deletable: false })
    assert.deepEqual(sectionCapabilities(real, 'AdminService.Authors', 'awards', 'AdminService.Authors_awards'.replace('Authors_awards', 'Awards')), { insertable: true, updatable: true, deletable: true })
  })

  test('NavigationRestrictions of the parent switch one navigation off, each right on its own', () => {
    const container = 'AdminService.EntityContainer/Authors'
    const restricted = (restrictions) => withRaw({ [container]: { '@Capabilities.NavigationRestrictions': { RestrictedProperties: [{ NavigationProperty: { $NavigationPropertyPath: 'awards' }, ...restrictions }] } } })
    assert.deepEqual(sectionCapabilities(restricted({ UpdateRestrictions: { Updatable: false } }), 'AdminService.Authors', 'awards', 'AdminService.Awards'), { insertable: true, updatable: false, deletable: true })
    assert.deepEqual(sectionCapabilities(restricted({ DeleteRestrictions: { Deletable: false } }), 'AdminService.Authors', 'awards', 'AdminService.Awards'), { insertable: true, updatable: true, deletable: false })
    assert.deepEqual(sectionCapabilities(restricted({ InsertRestrictions: { Insertable: false } }), 'AdminService.Authors', 'awards', 'AdminService.Awards'), { insertable: false, updatable: true, deletable: true })
    assert.deepEqual(sectionCapabilities(restricted({ UpdateRestrictions: { Updatable: false } }), 'AdminService.Authors', 'books', 'AdminService.Books'), { insertable: false, updatable: false, deletable: false }, 'another navigation is not touched by it')
    // a restriction that depends on the row does not switch the table off
    assert.equal(sectionCapabilities(restricted({ UpdateRestrictions: { Updatable: { $Path: 'x' } } }), 'AdminService.Authors', 'awards', 'AdminService.Awards').updatable, true)
  })

  describe('the Author draft (Awards: composition, Books: @readonly association)', () => {
    let edited
    before(async () => {
      assert.equal((await api.POST(`/htmx/admin/Authors(ID='${POE}',IsActiveEntity=true)/$edit`, {}, { headers: HX })).status, 200)
      edited = String((await api.GET(DRAFT, { headers: HX })).data)
    })
    after(async () => { await api.POST(`${DRAFT}/$discard`, {}, { headers: HX }) })

    // the search box is an input too: the cells are what counts
    const cells = html => /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? ''
    test('the Awards table is editable, the Books table is shown as in display mode (rows open their page)', () => {
      const awards = cells(section(edited, 'Awards'))
      assert.match(awards, /<input/)
      assert.match(awards, /hf-checkbox/)
      const booksSection = section(edited, 'Books')
      const books = cells(booksSection)
      assert.doesNotMatch(books, /<input/, 'no inputs')
      assert.doesNotMatch(books, /hf-checkbox/, 'no selection column')
      assert.doesNotMatch(booksSection, />Delete<|>Create<|data-hf-action="paste"/)
      assert.match(books, /hx-get="[^"]*\/books\(/, 'a row still opens its page')
    })

    test('requests made by hand are refused the same way, and change nothing', async () => {
      const book = (await api.axios.get('/admin/Books?$top=1&$filter=' + encodeURIComponent(`author_ID eq ${POE}`))).data.value[0]
      const keyRaw = `ID='${book.ID}'`
      const refused = async (method, url, body) => assert.equal((await api.axios[method](url, body, { headers: FORM.headers, validateStatus: () => true })).status, 405, `${method} ${url}`)
      await refused('patch', `${DRAFT}/books(${keyRaw})/$field/title`, 'title=Changed')
      await refused('post', `${DRAFT}/books/$delete`, new URLSearchParams([['keys', keyRaw]]).toString())
      await refused('post', `${DRAFT}/books`, '')
      assert.equal((await api.axios.get(`/admin/Books(${book.ID})`)).data.title, book.title)
    })
  })

  test('a page reached through a navigation has no Delete of its own (a Book of an Author, saved version)', async () => {
    const page = String((await api.GET(`/htmx/admin/Authors(ID='${POE}',IsActiveEntity=true)/books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000004')`, { headers: HX })).data)
    assert.doesNotMatch(page, /<div class="hf-op-title__actions">[\s\S]*?hx-delete=/)
    assert.match(String((await api.GET(`/htmx/admin/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000004')`, { headers: HX })).data), /hf-op-title__heading/)
  })
})
