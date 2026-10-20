const cds = require('@sap/cds')
const path = require('node:path')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const WUTHERING_HEIGHTS = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true"

describe('Object Page routes (Phase 4)', () => {

  test('GET /:Set(keys) renders the full Object Page: title, sections, form fields', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})`)
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/<html/)
    expect(res.data).to.match(/Wuthering Heights/)
    expect(res.data).to.match(/A classic novel of passion and revenge on the Yorkshire moors\./)
    expect(res.data).to.match(/id="op-section--GeneralInfo"/)
    expect(res.data).to.match(/id="op-section--Availability"/)
    expect(res.data).to.match(/id="op-section--RatingFacet"/)
    expect(res.data).to.match(/id="op-section--Chapters"/)
    expect(res.data).not.to.match(/\{i18n>/)
  })

  test('GET /:Set(keys) as an HX-Request returns just the fragment, not a full document', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})`, { headers: { 'HX-Request': 'true' } })
    expect(res.status).to.equal(200)
    expect(res.data).not.to.match(/<html/)
    expect(res.data).to.match(/^<title>/)
    expect(res.data).to.match(/Wuthering Heights/)
  })

  test('the Availability section renders the stock criticality status, not an empty span', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})`)
    expect(res.data).to.match(/fd-object-status--(positive|critical|negative)/)
  })

  test('the Chapters section is a table of the composition children, each linking to its own sub-Object-Page', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})`)
    expect(res.data).to.match(/I\. Lockwood&#39;s Visit/)
    const escapedKeys = WUTHERING_HEIGHTS.replace(/'/g, '&#39;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(res.data).to.match(new RegExp(`hx-get="/htmx/catalog/Books\\(${escapedKeys}\\)/chapters\\(ID=&#39;[^&]+&#39;`))
  })

  test('GET nested sub-Object-Page renders the chapter, with a breadcrumb back to the book', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})/chapters(ID='7c7c7c7c-0001-4a4a-8a8a-000000000001',IsActiveEntity=true)`)
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/I\. Lockwood&#39;s Visit/)
    expect(res.data).to.match(/fd-breadcrumb/)
    expect(res.data).to.match(/Wuthering Heights|Books/)
  })

  test('an unknown entity set returns 404', async () => {
    const { GET, expect } = api
    try {
      await GET("/htmx/catalog/NotAnEntity(ID='x',IsActiveEntity=true)")
      expect.fail('expected a 404')
    } catch (err) {
      expect(err.status ?? err.response?.status).to.equal(404)
    }
  })

  test('an unknown key returns 404', async () => {
    const { GET, expect } = api
    try {
      await GET("/htmx/catalog/Books(ID='00000000-0000-0000-0000-000000000000',IsActiveEntity=true)")
      expect.fail('expected a 404')
    } catch (err) {
      expect(err.status ?? err.response?.status).to.equal(404)
    }
  })

  test('an unknown navigation segment returns 404', async () => {
    const { GET, expect } = api
    try {
      await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})/notAnAssociation(ID='x')`)
      expect.fail('expected a 404')
    } catch (err) {
      expect(err.status ?? err.response?.status).to.equal(404)
    }
  })
})
