// Drafts of admin Authors (a draft root with a composition, Awards, and an association to a non-draft entity, Books), compared with
// the manage-authors FE app: Edit makes the whole page editable, the Awards table (a draft node) can be created in, deleted from and
// pasted into, the Books table (not draft) can be edited and deleted from but not created in; an Award opens as a page with
// editable General fields, Apply and neither Edit nor Delete.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const FORM = { headers: { ...HX, 'Content-Type': 'application/x-www-form-urlencoded' } }
const ID = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003' // Edgar Allan Poe: two awards, books
const AWARD = 'a1a1a1a1-0001-4a4a-8a8a-000000000001'
const ACTIVE = `/htmx/admin/Authors(ID='${ID}',IsActiveEntity=true)`
const DRAFT = `/htmx/admin/Authors(ID='${ID}',IsActiveEntity=false)`
const section = (html, id) => new RegExp(`<section id="op-section--${id}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? ''
const get = async (url, options = {}) => String((await api.GET(url, { headers: HX, ...options })).data)

describe('drafts of Authors (draft root with a composition and a non-draft association)', () => {
  let displayed, edited
  before(async () => {
    displayed = await get(ACTIVE) // before the draft: with one, the page has no Edit
    assert.equal((await api.POST(`${ACTIVE}/$edit`, {}, { headers: HX })).status, 200)
    edited = await get(DRAFT)
  })
  after(async () => { await api.POST(`${DRAFT}/$discard`, {}, { headers: HX }) })

  test('the saved version offers Edit and shows its sections (with the qualified line items of the annotations)', async () => {
    const page = displayed
    assert.match(page, /aria-label="Edit"/)
    for (const id of ['GeneratedFacet1', 'Books', 'Awards']) assert.match(page, new RegExp(`id="op-section--${id}"`), id)
    assert.match(section(page, 'Awards'), /Edgar Award/)
    assert.match(section(page, 'Books'), /data-hf-table-url=".*\/books\/\$table"/)
  })

  test('Edit makes the page editable: the General fields are inputs, Save and Discard Draft, no Edit', () => {
    assert.match(edited, /hf-page--edit/)
    assert.doesNotMatch(edited, /aria-label="Edit"/)
    assert.equal((section(edited, 'GeneratedFacet1').match(/<input[^>]*name="(name|dateOfBirth|email|phone)"/g) || []).length, 4)
    assert.match(edited, />Save</)
    assert.match(edited, />Discard Draft</)
  })

  test('the Awards table (a composition) has Create, Delete and paste; the Books table (an association) only Delete', () => {
    const awards = section(edited, 'Awards')
    assert.match(awards, /hx-post="[^"]*\/awards"[\s\S]*?>Create</)
    assert.match(awards, /\/awards\/\$delete/)
    assert.match(awards, /data-hf-action="paste"/)
    assert.match(awards, /<input/, 'the cells are inputs')

    const books = section(edited, 'Books')
    assert.match(books, /<input/, 'the cells are inputs')
    assert.match(books, /\/books\/\$delete/, 'Delete')
    assert.doesNotMatch(books, /hx-post="[^"]*\/books"/, 'no Create')
    assert.doesNotMatch(books, />Create</)
    assert.doesNotMatch(books, /data-hf-action="paste"/, 'no paste')
  })

  test('an Award opens as a page: editable General fields, Apply, neither Edit nor Delete', async () => {
    const award = await get(`${DRAFT}/awards(ID='${AWARD}',IsActiveEntity=false)`)
    assert.match(award, /hf-page--edit/)
    assert.equal((award.match(/<input[^>]*name="(name|year)"/g) || []).length, 2)
    assert.match(award, />Apply</)
    assert.doesNotMatch(award, /aria-label="Edit"|aria-label="Delete"|>Save</)
  })

  test('a field of the Award page is saved into the one draft, and Save of the Author activates it', async () => {
    const res = await api.axios.patch(`${DRAFT}/awards(ID='${AWARD}',IsActiveEntity=false)/$field/name`, new URLSearchParams({ name: 'Edgar Award (draft)' }).toString(), { headers: { ...FORM.headers, 'X-Hf-Source': 'op-field--General--name' } })
    assert.equal(res.status, 200)
    const draftAward = (await api.axios.get(`/admin/Authors(ID=${ID},IsActiveEntity=false)/awards(ID=${AWARD},IsActiveEntity=false)`)).data
    assert.equal(draftAward.name, 'Edgar Award (draft)')
    const activeAward = (await api.axios.get(`/admin/Authors(ID=${ID},IsActiveEntity=true)/awards(ID=${AWARD},IsActiveEntity=true)`)).data
    assert.equal(activeAward.name, 'Edgar Award', 'the saved version is untouched until Save')
  })

  test('a cell of the Books table is saved at once (the book is not part of the draft); Delete removes the book', async () => {
    const created = (await api.POST('/admin/Books', { title: 'Draft Test Book', author_ID: ID, stock: 1 })).data
    const keyRaw = `ID='${created.ID}'`
    const patched = await api.axios.patch(`${DRAFT}/books(${keyRaw})/$field/title`, new URLSearchParams({ title: 'Draft Test Book (renamed)' }).toString(), FORM)
    assert.equal(patched.status, 200)
    assert.equal((await api.axios.get(`/admin/Books(${created.ID})`)).data.title, 'Draft Test Book (renamed)')

    const res = await api.axios.post(`${DRAFT}/books/$delete`, new URLSearchParams([['keys', keyRaw]]).toString(), FORM)
    assert.equal(res.status, 200)
    assert.equal((await api.axios.get(`/admin/Books(${created.ID})`, { validateStatus: () => true })).status, 404)
  })

  test('the Books table pages and searches although the Author is a draft (the child has no draft state)', async () => {
    const rows = await get(`${DRAFT}/books/$table?$search=Crimson`)
    assert.match(rows, /Crimson/)
    assert.doesNotMatch(rows, /500|IsActiveEntity" not found/)
  })

  test('Save activates the draft: the Award has its new name', async () => {
    const saved = await api.POST(`${DRAFT}/$save`, {}, { headers: HX })
    assert.equal(saved.status, 200)
    assert.equal((await api.axios.get(`/admin/Authors(ID=${ID},IsActiveEntity=true)/awards(ID=${AWARD},IsActiveEntity=true)`)).data.name, 'Edgar Award (draft)')
    // put it back
    await api.POST(`${ACTIVE}/$edit`, {}, { headers: HX })
    await api.axios.patch(`${DRAFT}/awards(ID='${AWARD}',IsActiveEntity=false)/$field/name`, new URLSearchParams({ name: 'Edgar Award' }).toString(), FORM)
    await api.POST(`${DRAFT}/$save`, {}, { headers: HX })
    await api.POST(`${ACTIVE}/$edit`, {}, { headers: HX }) // the after hook discards a draft
  })
})
