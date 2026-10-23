/* global TextDecoder */
// Side effects wait for the field group to be left: a PATCH with X-Hf-Defer leaves them waiting, POST <object>/$effects runs them.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const channels = require('../../lib/sse/channels')

const BOOK_ID = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre, stock 5
const ACTIVE = `ID='${BOOK_ID}',IsActiveEntity=true`
const DRAFT = `ID='${BOOK_ID}',IsActiveEntity=false`

async function connect() {
  const clientId = `timing-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  const res = await fetch(`${api.url}/htmx/catalog/$events?client=${clientId}`, { headers: { Accept: 'text/event-stream' } })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reading = null // one read at a time: a read that lost a race against the timer still owns the next chunk
  const pump = async ms => {
    const deadline = Date.now() + ms
    for (;;) {
      const left = deadline - Date.now()
      if (left <= 0) return buffer
      reading ??= reader.read()
      const result = await Promise.race([reading, new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), left))])
      if (result.timedOut) return buffer
      reading = null
      if (result.done) return buffer
      buffer += decoder.decode(result.value, { stream: true })
    }
  }
  await pump(400)
  return { clientId, pump, headers: { 'HX-Request': 'true', 'X-Htmx-Client': clientId }, close: () => { reader.cancel().catch(() => {}); channels.remove(clientId) } }
}

describe('side effects wait for the field group to be left', () => {
  test('a deferred PATCH pushes nothing until $effects, then the effects arrive once', async () => {
    const { POST, PATCH, expect } = api
    const c = await connect()
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    try {
      const res = await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/stock`, { stock: 0 }, { headers: { ...c.headers, 'X-Hf-Defer': '1' } })
      expect(res.status).to.equal(200)
      // the PATCH's own answer is immediate (other places showing the property); the annotated side effects are not
      assert.doesNotMatch(await c.pump(700), /htmx:fe:sideEffects/)

      const flush = await POST(`/htmx/catalog/Books(${DRAFT})/$effects`, {}, { headers: c.headers })
      expect(flush.status).to.equal(204)
      const out = await c.pump(1500)
      assert.match(out, /htmx:fe:sideEffects/)
      assert.match(out, /Out of Stock/)

      // flushed: a second flush has nothing to run
      const before = out.length
      await POST(`/htmx/catalog/Books(${DRAFT})/$effects`, {}, { headers: c.headers })
      assert.equal((await c.pump(600)).length, before)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
      c.close()
    }
  })

  test('several changes in a group run their effects together, in one flush', async () => {
    const { POST, PATCH } = api
    const c = await connect()
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    try {
      for (const stock of [3, 0]) await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/stock`, { stock }, { headers: { ...c.headers, 'X-Hf-Defer': '1' } })
      assert.doesNotMatch(await c.pump(500), /htmx:fe:sideEffects/)
      await POST(`/htmx/catalog/Books(${DRAFT})/$effects`, {}, { headers: c.headers })
      const out = await c.pump(1500)
      assert.equal((out.match(/event: htmx:fe:sideEffects/g) || []).length, 1)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
      c.close()
    }
  })

  test('without X-Hf-Defer the effects are immediate, as before', async () => {
    const { POST, PATCH } = api
    const c = await connect()
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    try {
      await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/stock`, { stock: 0 }, { headers: c.headers })
      assert.match(await c.pump(1500), /htmx:fe:sideEffects/)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
      c.close()
    }
  })

  test('$effects needs a page (client id) and an object', async () => {
    const { POST } = api
    assert.equal((await POST(`/htmx/catalog/Books(${DRAFT})/$effects`, {}, { headers: { 'HX-Request': 'true' }, validateStatus: () => true })).status, 404)
    assert.equal((await POST('/htmx/catalog/Books/$effects', {}, { headers: { 'HX-Request': 'true', 'X-Htmx-Client': 'x' }, validateStatus: () => true })).status, 404)
  })

  test('the form of a field group says which group it is', async () => {
    const page = String((await api.GET(`/htmx/catalog/Books(${ACTIVE})`)).data)
    assert.match(page, /<div class="hf-form" data-hf-fieldgroup="[^"]+">/)
  })
})
