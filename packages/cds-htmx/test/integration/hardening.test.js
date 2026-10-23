// Fixes found in the architecture review: escaped action errors, the session cookie, escaped attributes.
const cds = require('@sap/cds')
const path = require('node:path')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const BOOK = "ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true"

describe('hardening', () => {
  test('an action that fails answers with an escaped message strip, never raw HTML', async () => {
    const { POST, expect } = api
    // the action runs on a key that does not exist; whatever the message, it has to come back escaped
    const res = await POST(`/htmx/catalog/Books(ID='00000000-0000-0000-0000-00000000dead',IsActiveEntity=true)/$action/addStock`, { quantity: '<img src=x onerror=alert(1)>' }, { validateStatus: () => true })
    expect(res.status).to.be.oneOf([400, 404])
    expect(String(res.data)).not.to.match(/<img src=x/)
  })

  test('the session cookie is set once: a request that already has it does not get another', async () => {
    const { GET, expect } = api
    const first = await GET('/htmx/catalog/Books')
    const set = first.headers['set-cookie']
    expect(set).to.be.ok
    const cookie = [].concat(set).find(c => c.startsWith('JSESSIONID=')).split(';')[0]
    const second = await GET('/htmx/catalog/Books', { headers: { cookie: `a=1; ${cookie}; b=2` } })
    expect(second.headers['set-cookie'] ?? [], String(second.headers['set-cookie'])).to.deep.equal([])
  })

  test('a key quote in the object path is escaped inside the attributes of an edit field', async () => {
    const { POST, GET, expect } = api
    await POST(`/htmx/catalog/Books(${BOOK})/$edit`, {})
    const res = await GET(`/htmx/catalog/Books(${BOOK.replace('true', 'false')})`, { headers: { 'HX-Request': 'true' } })
    expect(res.data).to.match(/hx-patch="[^"']*&#39;[^"']*"/)
  })
})
