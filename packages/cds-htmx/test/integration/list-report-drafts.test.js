const cds = require('@sap/cds')
const path = require('node:path')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { headers: { 'HX-Request': 'true' } }
const TABLE = '/htmx/catalog/Books/$table'
const count = html => Number(html.match(/<hx-partial hx-target="#lr-count"[^>]*>[^\d]*([\d,]+)/)?.[1].replace(/,/g, ''))
const idOf = raw => raw.match(/ID='([^']+)'/)[1]
const rowOf = (id, active) => `id="lr-row--${id}-${active}"`
const keysOf = res => (res.headers['hx-push-url'] ?? res.headers['hx-replace-url']).match(/Books\(([^)]*)\)/)[1]

describe('own drafts in the List Report', () => {
  let raw // the keys of the draft made with New
  let before

  test('a new draft is a row of the list, with the Draft indicator, and counts', async () => {
    const { GET, POST, PATCH, expect } = api
    before = count((await GET(TABLE, HX)).data)

    raw = keysOf(await POST('/htmx/catalog/Books', {}))
    const authorId = (await GET('/odata/v4/catalog/Authors?$top=1')).data.value[0].ID
    await PATCH(`/htmx/catalog/Books(${raw})/$field/title`, { title: 'Zzz Own Draft' })
    await PATCH(`/htmx/catalog/Books(${raw})/$field/author_ID`, { author_ID: authorId })

    const res = await GET(`${TABLE}?$search=Zzz Own Draft`, HX)
    expect(res.data).to.include(rowOf(idOf(raw), false)) // the row opens the draft
    expect(res.data).to.include(`IsActiveEntity=false)`)
    expect(count((await GET(TABLE, HX)).data)).to.equal(before + 1)
  })

  test('the Editing Status "Own Draft" lists the drafts only, "Unchanged" none', async () => {
    const { GET, expect } = api
    const own = await GET(`${TABLE}?f.EditingStatus=OWN_DRAFT`, HX)
    expect(own.data).to.include(rowOf(idOf(raw), false))
    expect(own.data).not.to.match(/IsActiveEntity=true/)
    const unchanged = await GET(`${TABLE}?f.EditingStatus=UNCHANGED`, HX)
    expect(unchanged.data).not.to.include(rowOf(idOf(raw), false))
  })

  test('saving replaces the draft row by the active entry', async () => {
    const { GET, POST, expect } = api
    expect((await POST(`/htmx/catalog/Books(${raw})/$save`, {})).status).to.equal(200)
    const res = await GET(`${TABLE}?$search=Zzz Own Draft`, HX)
    expect(res.data).to.include(rowOf(idOf(raw), true))
    expect(res.data).not.to.include(rowOf(idOf(raw), false))
    expect(count((await GET(TABLE, HX)).data)).to.equal(before + 1)
  })

  test('sorting by a path column (author.name) and by a plain one works beside the drafts', async () => {
    const { GET, expect } = api
    for (const orderby of ['author.name', 'author.name desc', 'author_ID', 'title desc']) {
      const res = await GET(`${TABLE}?$orderby=${encodeURIComponent(orderby)}`, HX)
      expect(res.status).to.equal(200)
      expect(res.data).to.include('id="lr-row--')
    }
  })

  test('discarding a new draft removes its row', async () => {
    const { GET, POST, expect } = api
    const draft = keysOf(await POST('/htmx/catalog/Books', {}))
    expect((await GET(`${TABLE}?f.EditingStatus=OWN_DRAFT`, HX)).data).to.include(rowOf(idOf(draft), false))
    await POST(`/htmx/catalog/Books(${draft})/$discard`, {})
    const res = await GET(TABLE, HX)
    expect(res.data).not.to.include(idOf(draft))
    expect(count(res.data)).to.equal(before + 1)
  })
})
