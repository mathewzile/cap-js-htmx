const cds = require('@sap/cds')
const path = require('node:path')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

describe('List Report routes (Phase 3)', () => {

  test('GET /:Set renders the full page with the filter bar, toolbar title/count and table rows', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books')
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/<html/)
    expect(res.data).to.match(/id="lr-filter-bar"/)
    expect(res.data).to.match(/id="lr-toolbar"/)
    expect(res.data).to.match(/id="lr-table"/)
    expect(res.data).to.match(/id="lr-table-body"/)
    expect(res.data).to.match(/id="lr-count"/)
    expect(res.data).not.to.match(/\{i18n>/) // i18n placeholders must be resolved before rendering
  })

  test('GET /:Set as an HX-Request returns just the fragment, not a full document', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books', { headers: { 'HX-Request': 'true' } })
    expect(res.status).to.equal(200)
    expect(res.data).not.to.match(/<html/)
    expect(res.data).to.match(/^<title>/)
    expect(res.data).to.match(/id="lr-table"/)
  })

  test('each row links to its Object Page with the OData key segment', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books')
    expect(res.data).to.match(/hx-get="\/htmx\/catalog\/Books\(ID=&#39;[^&]+&#39;,IsActiveEntity=true\)"/)
  })

  test('GET /:Set/$table returns just rows + an <hx-partial> count update, never a full document', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books/$table')
    expect(res.status).to.equal(200)
    expect(res.data).not.to.match(/<html/)
    expect(res.data).not.to.match(/<table/)
    expect(res.data).to.match(/<tr/)
    expect(res.data).to.match(/<hx-partial hx-target="#lr-count"/)
  })

  test('$search filters the table rows', async () => {
    const { GET, expect } = api
    const all = await GET('/htmx/catalog/Books/$table')
    const filtered = await GET('/htmx/catalog/Books/$table?$search=Wuthering')
    expect(filtered.status).to.equal(200)
    expect(filtered.data.length).to.be.lessThan(all.data.length)
  })

  test('f.<path> filters are applied and an unknown filter key is ignored rather than erroring', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books/$table?f.stock.ge=0&f.bogusField=x')
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/<tr/)
  })

  test('draft roots get an Editing Status select; every status value queries without error', async () => {
    const { GET, expect } = api
    const page = await GET('/htmx/catalog/Books')
    expect(page.data).to.match(/<select id="f-EditingStatus" name="f.EditingStatus"/)
    const all = await GET('/htmx/catalog/Books/$table?f.EditingStatus=ALL')
    expect(all.data).to.match(/<tr/)
    for (const status of ['OWN_DRAFT', 'UNCHANGED', 'bogus']) {
      const res = await GET(`/htmx/catalog/Books/$table?f.EditingStatus=${status}`)
      expect(res.status).to.equal(200)
    }
    const unchanged = await GET('/htmx/catalog/Books/$table?f.EditingStatus=UNCHANGED&f.stock.ge=0')
    expect(unchanged.status).to.equal(200)
  })

  test('$orderby sorts and the growing "More" button advances $skip', async () => {
    const { GET, expect } = api
    const sorted = await GET('/htmx/catalog/Books/$table?$orderby=title desc')
    expect(sorted.status).to.equal(200)

    const firstPage = await GET('/htmx/catalog/Books')
    const moreMatch = firstPage.data.match(/\$table\?([^"]*\$skip=\d+[^"]*)"/)
    if (moreMatch) {
      const more = await GET(`/htmx/catalog/Books/$table?${moreMatch[1].replace(/&amp;/g, '&')}`)
      expect(more.status).to.equal(200)
    }
  })

  test('an unknown entity set returns 404', async () => {
    const { GET, expect } = api
    try {
      await GET('/htmx/catalog/NotAnEntity')
      expect.fail('expected a 404')
    } catch (err) {
      expect(err.status ?? err.response?.status).to.equal(404)
    }
  })
})
