const cds = require('@sap/cds')
const path = require('node:path')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const WUTHERING_HEIGHTS = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true"

function pushUrlKeys(res) {
  const url = (res.headers['hx-replace-url'] ?? res.headers['hx-push-url'])
  const m = url && url.match(/Books\(([^)]*)\)/)
  return { url, raw: m ? m[1] : null }
}

describe('Draft lifecycle routes (Phase 5)', () => {
  let authorId
  let createdDraftRaw
  let activeRaw
  let editedDraftRaw

  test('GET Authors to find an author to attach new Books to', async () => {
    const { GET, expect } = api
    const res = await GET('/odata/v4/catalog/Authors?$top=1')
    expect(res.status).to.equal(200)
    authorId = res.data.value[0].ID
    expect(authorId).to.be.ok
  })

  test('POST /:Set creates an empty draft and navigates into its draft Object Page', async () => {
    const { POST, expect } = api
    const res = await POST('/htmx/catalog/Books', {})
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/id="op-footer"/)
    expect(res.data).not.to.match(/aria-label="Edit"/)
    expect(res.data).not.to.match(/hx-delete=/) // no Delete of the object itself while editing (a section has its own Delete)
    expect(res.data).to.match(/<input type="text" class="fd-input"[^>]*name="title"/)

    const { url, raw } = pushUrlKeys(res)
    expect(url).to.match(/IsActiveEntity=false/)
    createdDraftRaw = raw
    expect(createdDraftRaw).to.be.ok
  })

  test('PATCH /:Set/$field/:path patches a draft field and returns 204', async () => {
    const { PATCH, expect } = api
    const res = await PATCH(
      `/htmx/catalog/Books(${createdDraftRaw})/$field/title`,
      { title: 'Patched Draft Title' }
    )
    expect(res.status).to.equal(200) // 200: carries the other places that show the value (header title)
    expect(res.data).to.include('id="op-title"')
    expect(res.data).to.include('Patched Draft Title')

    const res2 = await PATCH(
      `/htmx/catalog/Books(${createdDraftRaw})/$field/author_ID`,
      { author_ID: authorId }
    )
    expect(res2.status).to.equal(200)
  })

  test('POST /:Set(keys)/$save activates the draft, rendering the active Object Page with the patched value', async () => {
    const { POST, expect } = api
    const res = await POST(`/htmx/catalog/Books(${createdDraftRaw})/$save`, {})
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/Patched Draft Title/)
    expect(res.data).not.to.match(/id="op-footer"/)
    expect(res.data).to.match(/aria-label="Edit"/)
    expect(res.data).to.match(/aria-label="Delete"/)

    const { url, raw } = pushUrlKeys(res)
    expect(url).to.match(/IsActiveEntity=true/)
    activeRaw = raw
  })

  test('POST /:Set(keys)/$discard on a brand-new draft (no active counterpart) returns to the List Report', async () => {
    const { POST, expect } = api
    const created = await POST('/htmx/catalog/Books', {})
    const { raw: newDraftRaw } = pushUrlKeys(created)
    expect(newDraftRaw).to.be.ok

    const res = await POST(`/htmx/catalog/Books(${newDraftRaw})/$discard`, {})
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/id="lr-table"/)
    const { url } = pushUrlKeys(res)
    expect(url).to.match(/\/htmx\/catalog\/Books$/)
  })

  test('POST /:Set(keys)/$edit edits an existing active row into a new draft, with the Save/Discard footer', async () => {
    const { POST, expect } = api
    const res = await POST(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})/$edit`, {})
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/Wuthering Heights/)
    expect(res.data).to.match(/id="op-footer"/)
    expect(res.data).not.to.match(/aria-label="Edit"/)

    const { url } = pushUrlKeys(res)
    expect(url).to.match(/IsActiveEntity=false/)
    editedDraftRaw = pushUrlKeys(res).raw
  })

  test('the edited draft renders genre_ID as a fd-select of fixed values (Common.ValueListWithFixedValues)', async () => {
    const { GET, expect } = api
    const res = await GET(`/htmx/catalog/Books(${editedDraftRaw})`)
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/<select class="fd-select"[^>]*name="genre_ID"/)
    expect(res.data).to.match(/<option value="1"[^>]* selected[^>]*>Fiction<\/option>/)
    expect(res.data).to.match(/<option value="2"[^>]*>Poetry<\/option>/)
  })

  test('POST /:Set(keys)/$discard on an edited draft returns to the (still existing) active Object Page', async () => {
    const { GET, POST, expect } = api

    const res = await POST(`/htmx/catalog/Books(${editedDraftRaw})/$discard`, {})
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/Wuthering Heights/)
    expect(res.data).to.match(/aria-label="Edit"/)
    expect(res.data).not.to.match(/id="op-footer"/)
    const { url } = pushUrlKeys(res)
    expect(url).to.match(/IsActiveEntity=true/)

    const stillActive = await GET(`/htmx/catalog/Books(${WUTHERING_HEIGHTS})`)
    expect(stillActive.status).to.equal(200)
  })

  test('DELETE /:Set(keys) deletes the active object and returns to the List Report', async () => {
    const { DELETE, expect } = api
    expect(activeRaw).to.be.ok
    const res = await DELETE(`/htmx/catalog/Books(${activeRaw})`)
    expect(res.status).to.equal(200)
    expect(res.data).to.match(/id="lr-table"/)
    const { url } = pushUrlKeys(res)
    expect(url).to.match(/\/htmx\/catalog\/Books$/)
  })
})
