// A sub-object page shows Edit in display mode (as in Fiori elements), but the draft belongs to the first page (the root): Edit
// makes the whole object editable and the sub-object page then shows its draft (Apply, no Edit, no Delete).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const HX = { 'HX-Request': 'true' }
const BOOK = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002'
const CHAPTER = '7c7c7c7c-0002-4a4a-8a8a-000000000001'
const ACTIVE = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=true)`
const DRAFT = `/htmx/catalog/Books(ID='${BOOK}',IsActiveEntity=false)`
const CHILD = `${ACTIVE}/chapters(ID='${CHAPTER}',IsActiveEntity=true)`
const page = async url => String((await api.GET(url, { headers: HX })).data)
const editButton = html => /aria-label="Edit"/.test(html)

describe('sub-object pages and Edit', () => {
  test('the sub-object page offers Edit too: it edits the root and stays on the chapter', async () => {
    const { POST, expect } = api
    assert.ok(editButton(await page(ACTIVE)), 'the Book page has Edit')
    const child = await page(CHILD)
    assert.ok(editButton(child), 'the Chapter page has Edit')
    assert.ok(child.includes(`hx-post="${CHILD.replaceAll("'", '&#39;')}/$edit"`), 'it asks the chapter path, which edits the root: ' + child.match(/hx-post="[^"]*edit"/g))
    const res = await POST(`${CHILD}/$edit`, {}, { headers: HX })
    try {
      expect(res.status).to.equal(200)
      assert.match(res.headers['hx-replace-url'], /IsActiveEntity=false\)\/chapters\(.*IsActiveEntity=false\)$/)
      const html = String(res.data)
      assert.match(html, /hf-page--edit/)
      assert.match(html, /<input[^>]*name="title"/, 'the chapter is the draft')
      assert.match(html, />Apply</)
      assert.ok(!editButton(html))
      assert.ok(!editButton(await page(`${DRAFT}/chapters(ID='${CHAPTER}',IsActiveEntity=false)`)))
    } finally {
      await POST(`${DRAFT}/$discard`, {}, { headers: HX })
    }
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
      assert.ok(!editButton(await page(CHILD)), 'the saved version of the chapter has no Edit while the root has a draft')
    } finally {
      await POST(`${DRAFT}/$discard`, {}, { headers: HX })
    }
  })
})
