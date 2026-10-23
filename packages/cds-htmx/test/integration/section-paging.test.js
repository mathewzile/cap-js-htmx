// Object Page table sections page like the List Report table: first page, a More row for the rest, search / sort / export on the
// whole set (the section's own `$table` / `$export`), items per page from UI.PresentationVariant MaxItems.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const cache = require('../../lib/model/cache')
const { buildObjectPage } = require('../../lib/model/object-page')
const { buildListReport } = require('../../lib/model/list-report')

const HX = { 'HX-Request': 'true' }
const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const AUTHOR = "/htmx/admin/Authors(ID='9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002')"
const get = async (url, headers = HX) => String((await api.GET(url, { headers })).data)
const sectionRows = html => [...html.matchAll(/<tr id="lr-row--([^"]+)"[^>]*hx-get="[^"]*\/books\(/g)].map(m => m[1])
const titles = html => [...html.matchAll(/<tr id="lr-row--[^"]+"[^>]*hx-get="[^"]*\/books\([\s\S]*?<td class="fd-table__cell hf-col-0">([^<]*)</g)].map(m => m[1])
const countOf = html => Number(/id="op-section--Books-count"> \(([\d,]+)\)/.exec(html)?.[1].replace(/,/g, ''))

describe('table sections page', () => {
  test('the first page is one page, the title has the total and a More button the rest', async () => {
    const page = await get(AUTHOR)
    const total = countOf(page)
    assert.ok(total > 20, `total ${total}`)
    assert.equal(sectionRows(page).length, 10)
    assert.match(page, new RegExp(`id="op-section--Books-growing"[\\s\\S]*?\\[ 10 / ${total.toLocaleString('en')} \\]`))
    assert.match(page, /id="op-section--Books-body"/)
    assert.match(page, /data-hf-table-url="[^"]*\/books\/\$table"/)
  })

  test('following the More button reads every row once, in a stable order', async () => {
    const total = countOf(await get(AUTHOR))
    const seen = sectionRows(await get(AUTHOR))
    for (let skip = 10; skip < total + 20; skip += 10) {
      const next = await get(`${AUTHOR}/books/$table?$skip=${skip}`)
      const rows = sectionRows(next)
      if (!rows.length) break
      seen.push(...rows)
      assert.match(next, /<hx-partial hx-target="#op-section--Books-count"/)
      if (skip + rows.length >= total) assert.doesNotMatch(next, /hf-table__growing-button/, 'the last page has no More button')
    }
    assert.equal(seen.length, total)
    assert.equal(new Set(seen).size, total)
  })

  test('a search is over the whole set: the total shrinks and the More button keeps the search', async () => {
    const all = countOf(await get(AUTHOR))
    const found = await get(`${AUTHOR}/books/$table?$search=Crimson`)
    const shown = titles(found)
    assert.ok(shown.length > 0 && shown.every(t => /Crimson/i.test(t)), shown.join('|'))
    const count = Number(/\(([\d,]+)\)<\/hx-partial>/.exec(found)[1])
    assert.ok(count > 0 && count < all)
    if (count > 10) assert.match(found.replace(/&amp;/g, '&'), /\$search=Crimson|%24search=Crimson/)
  })

  test('a sort is over the whole set, not the page', async () => {
    const asc = titles(await get(`${AUTHOR}/books/$table?$orderby=${encodeURIComponent('title')}`))
    const desc = titles(await get(`${AUTHOR}/books/$table?$orderby=${encodeURIComponent('title desc')}`))
    assert.deepEqual(asc, [...asc].sort((a, b) => a.localeCompare(b)).slice(0, asc.length))
    assert.deepEqual(desc, [...desc].sort((a, b) => b.localeCompare(a)))
    assert.notEqual(asc[0], desc[0])
    assert.ok(asc[0].localeCompare(desc[0]) <= 0)
  })

  test('$export is every row, with the search and sort, as CSV', async () => {
    const total = countOf(await get(AUTHOR))
    const res = await api.GET(`${AUTHOR}/books/$export`, { headers: HX })
    assert.match(res.headers['content-type'], /text\/csv/)
    const lines = String(res.data).trim().split(/\r?\n/)
    assert.equal(lines.length - 1, total)
    const one = String((await api.GET(`${AUTHOR}/books/$export?$search=Crimson&cols=0`, { headers: HX })).data).trim().split(/\r?\n/)
    assert.ok(one.length > 1 && one.length - 1 < total)
    assert.ok(one.slice(1).every(l => /Crimson/i.test(l)))
  })

  test('unknown sections and objects are 404, not an empty table', async () => {
    for (const url of [`${AUTHOR}/nothing/$table`, "/htmx/admin/Authors(ID='x')/$table", `${AUTHOR}/books(ID='x')/$table`]) {
      assert.equal((await api.GET(url, { headers: HX, validateStatus: () => true })).status, 404, url)
    }
  })

  test('rows are the section\'s own markup: they open the sub-object page', async () => {
    const rows = await get(`${AUTHOR}/books/$table?$skip=10`)
    assert.match(rows, /hx-get="[^"]*\/Authors\(ID=&#39;9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002&#39;\)\/books\(ID=/)
    assert.doesNotMatch(rows, /<input/, 'display mode: no inputs')
  })
})

describe('items per page: UI.PresentationVariant MaxItems', () => {
  let real
  before(() => { real = cache.storeFor(cds.model, 'AdminService', '/admin/', { appRoot: root }) }) // the model is there once the server is up
  const withMaxItems = (type, maxItems) => Object.assign(Object.create(real), {
    raw: t => t === type ? { ...real.raw(t), '@UI.PresentationVariant': { MaxItems: maxItems } } : real.raw(t)
  })
  const booksSection = (store, pageSettings) => buildObjectPage(cds.model, store, 'AdminService.Authors', { pageSettings }).sections.find(s => s.id === 'Books').content

  test('a section\'s page size is the MaxItems of its table\'s presentation variant', () => {
    assert.equal(booksSection(withMaxItems('AdminService.Books', 7)).growingThreshold, 7)
  })

  test('without it the manifest\'s growingThreshold, then FE\'s default', () => {
    const settings = { controlConfiguration: { 'books/@com.sap.vocabularies.UI.v1.LineItem#Books': { tableSettings: { growingThreshold: 9 } } } }
    assert.equal(booksSection(real, settings).growingThreshold, 9)
    assert.equal(booksSection(real).growingThreshold, 10, 'FE shows 10 rows of a table section, 20 of a List Report table')
    assert.equal(booksSection(withMaxItems('AdminService.Books', 7), settings).growingThreshold, 7, 'MaxItems wins')
  })

  test('the List Report table reads it the same way', () => {
    assert.equal(buildListReport(withMaxItems('AdminService.Books', 7), 'AdminService.Books').table.growingThreshold, 7)
    assert.equal(buildListReport(real, 'AdminService.Books').table.growingThreshold, 20)
    assert.equal(buildListReport(real, 'AdminService.Books', { pageSettings: { controlConfiguration: { '@com.sap.vocabularies.UI.v1.LineItem': { tableSettings: { growingThreshold: 11 } } } } }).table.growingThreshold, 11)
  })
})
