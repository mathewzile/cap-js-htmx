// A sub-object page has no Edit of its own, with or without columns: the draft belongs to the first page (the root), Edit there
// makes the whole object editable, the sub-object page then shows its draft (Apply, Delete) -- as in Fiori elements.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002'
const CHAPTER = '7c7c7c7c-0002-4a4a-8a8a-000000000001'
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const DRAFT = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=false)`
const page = async url => String((await api.GET(url, { headers: HX })).data)
const editButton = html => /aria-label="Edit"/.test(html)

describe('sub-object pages and Edit', () => {
  test('the first page offers Edit, the sub-object page does not (saved version)', async () => {
    assert.ok(editButton(await page(ACTIVE)), 'the Book page has Edit')
    const child = await page(`${ACTIVE}/chapters(ID='${CHAPTER}',IsActiveEntity=true)`)
    assert.ok(!editButton(child), 'the Chapter page has none')
    assert.doesNotMatch(child, /\$edit/)
  })

  test('while the first page is edited the sub-object page is the draft: Apply, no Edit and no Delete (as in FE)', async () => {
    const { POST, expect } = api
    expect((await POST(`${ACTIVE}/$edit`, {}, { headers: HX })).status).to.equal(200)
    try {
      const child = await page(`${DRAFT}/chapters(ID='${CHAPTER}',IsActiveEntity=false)`)
      assert.match(child, /hf-page--edit/)
      assert.ok(!editButton(child))
      assert.doesNotMatch(child, /aria-label="Delete"|>Delete</)
      assert.match(child, />Apply</)
      assert.match(child, /<input[^>]*name="title"/, 'the fields are inputs')
    } finally {
      await POST(`${DRAFT}/$discard`, {}, { headers: HX })
    }
  })
})
