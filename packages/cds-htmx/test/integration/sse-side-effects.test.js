/* global TextDecoder */
const cds = require('@sap/cds')
const path = require('node:path')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const channels = require('../../lib/sse/channels')
const engine = require('../../lib/sse/side-effects-engine')

const BOOK_ID = '3d2d2d2d-1c1c-4b4b-8a8a-000000000002' // Jane Eyre, stock 5
const ACTIVE = `ID='${BOOK_ID}',IsActiveEntity=true`
const DRAFT = `ID='${BOOK_ID}',IsActiveEntity=false`

/** Opens `/$events` for a fresh client id and returns helpers to read what the server pushes. */
async function connect(label) {
  const clientId = `${label}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  const res = await fetch(`${api.url}/htmx/catalog/$events?client=${clientId}`, { headers: { Accept: 'text/event-stream' } })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const readUntil = async (pattern, ms = 5000) => {
    const deadline = Date.now() + ms
    while (!pattern.test(buffer)) {
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`timed out waiting for ${pattern}; got:\n${buffer}`)
      const timeout = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), left))
      const { value, done, timeout: timedOut } = await Promise.race([reader.read(), timeout])
      if (timedOut) continue
      if (done) throw new Error('SSE stream closed early')
      buffer += decoder.decode(value, { stream: true })
    }
    return buffer
  }
  await readUntil(/event: connected\n/)
  return {
    clientId, readUntil,
    seen: () => buffer,
    headers: { 'HX-Request': 'true', 'X-Htmx-Client': clientId },
    close: () => { reader.cancel().catch(() => {}); channels.remove(clientId) }
  }
}

describe('SSE side effects (Phase 6)', () => {
  const clients = []
  afterEach(() => { for (const c of clients.splice(0)) c.close() })
  const open = async label => { const c = await connect(label); clients.push(c); return c }

  test('a full page carries the client id header and SSE connector', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Books')
    expect(res.data).to.match(/<body[^>]*hx-headers:inherited='\{"X-Htmx-Client":"[0-9a-f-]{36}"\}'/)
    const id = res.data.match(/X-Htmx-Client":"([0-9a-f-]{36})"/)[1]
    expect(res.data).to.include(`"url":"/htmx/catalog/$events?client=${id}"`) // the page script connects on demand
    expect(res.data).to.include('id="hf-live" hidden data-hf-live="1"') // Books has side effects (live List Report)
  })

  test('pages of entities without side effects do not ask for a stream', async () => {
    const { GET, expect } = api
    const res = await GET('/htmx/catalog/Genres')
    expect(res.data).to.include('data-hf-live="0"')
    const op = await GET(`/htmx/catalog/Books(${ACTIVE})`)
    expect(op.data).to.include('data-hf-live="1"')
  })

  test('the channel remembers the app and what the page shows', async () => {
    const { GET, expect } = api
    const c = await open('view')
    await GET(`/htmx/catalog/Books(${ACTIVE})`, { headers: c.headers })
    const view = channels.get(c.clientId).view
    expect(view.entityType).to.equal('CatalogService.Books')
    expect(view.keys.ID).to.equal(BOOK_ID)
    expect(view.keys.IsActiveEntity).to.equal(true)
    expect(view.entitySetPath).to.equal(`Books(${ACTIVE})`)
    await GET('/htmx/catalog/Books', { headers: c.headers })
    expect(channels.get(c.clientId).view).to.include({ list: true, set: 'Books' })
  })

  test('PATCH of a source property pushes the targeted fields as one <hx-partial> message', async () => {
    const { GET, POST, PATCH, expect } = api
    const c = await open('patch')
    const edit = await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    expect(edit.status).to.equal(200)

    try {
      const res = await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/stock`, { stock: 0 }, { headers: c.headers })
      expect(res.status).to.equal(200)

      const out = await c.readUntil(/event: htmx:fe:sideEffects\n/)
      const message = out.slice(out.indexOf('\n\n', out.indexOf('event: connected')) + 2)
      // unnamed message => swapped by hx-sse; the named event follows it
      expect(message).to.match(/^data: <hx-partial hx-target="#op-field--[^"]+--stockStatus" hx-swap="outerMorph">/m)
      // stockCriticality is the Status field's own criticality, so it rides along in the same partial
      expect(message).to.include('fd-object-status--negative')
      expect(message).to.include('Out of Stock') // Jane Eyre (stock 5, Low Stock) -> stock 0 changes the status
      // Target list of #Stock: stockStatus + stockCriticality only (no unrelated field re-rendered)
      expect(message).not.to.match(/hx-target="#op-field--[^"]+--title"/)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
    }
    expect((await GET(`/odata/v4/catalog/Books(${ACTIVE})`)).data.stock).to.equal(5)
  })

  test('PATCH of a property without a side effect pushes nothing', async () => {
    const { POST, PATCH, expect } = api
    const c = await open('quiet')
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    try {
      await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/descr`, { descr: 'quiet change' }, { headers: c.headers })
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(c.seen()).not.to.include('hx-partial')
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
    }
  })

  test('PATCH without a client id still works and pushes nothing', async () => {
    const { POST, PATCH, expect } = api
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: { 'HX-Request': 'true' } })
    try {
      const res = await PATCH(`/htmx/catalog/Books(${DRAFT})/$field/stock`, { stock: 4 })
      expect(res.status).to.equal(200)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: { 'HX-Request': 'true' } })
    }
  })

  test('SourceEvents: simulateDelivery refreshes the object page of another client and the live List Report row', async () => {
    const { GET, POST, expect } = api
    const viewer = await open('viewer')
    const list = await open('list')
    await GET(`/htmx/catalog/Books(${ACTIVE})`, { headers: viewer.headers })
    await GET('/htmx/catalog/Books', { headers: list.headers })

    const before = (await GET(`/odata/v4/catalog/Books(${ACTIVE})`)).data.stock
    const res = await POST('/odata/v4/catalog/simulateDelivery', { book: BOOK_ID, qty: 20 })
    expect(res.status).to.be.oneOf([200, 204])

    const op = await viewer.readUntil(/event: htmx:fe:sideEffects\n/)
    expect(op).to.match(/hx-target="#op-field--[^"]+--stockStatus"/)
    expect(op).to.include('In Stock')
    expect(op).to.include(String(before + 20))

    const lr = await list.readUntil(/event: htmx:fe:sideEffects\n/)
    expect(lr).to.match(/hx-target="#lr-row--3d2d2d2d-1c1c-4b4b-8a8a-000000000002-true" hx-swap="outerMorph"/)
    expect(lr).to.match(/<tr id="lr-row--3d2d2d2d-1c1c-4b4b-8a8a-000000000002-true"/)

    // put the stock back for other tests
    await POST('/odata/v4/catalog/simulateDelivery', { book: BOOK_ID, qty: -20 })
  })

  test('onChange() with a changed table section (SourceEntities) re-renders the targeted totals', async () => {
    const { POST, expect } = api
    const c = await open('nav')
    await POST(`/htmx/catalog/Books(${ACTIVE})/$edit`, {}, { headers: c.headers })
    try {
      const srv = cds.services.CatalogService
      const view = {
        service: srv.name, servicePath: '/odata/v4/catalog/', entityType: 'CatalogService.Books',
        keys: { ID: BOOK_ID, IsActiveEntity: false }, contextPath: '/Books', basePath: '/htmx/catalog', entitySetPath: `Books(${DRAFT})`
      }
      await srv.tx(tx => engine.onChange(tx, view, { clientId: c.clientId, navigations: ['chapters'] }))
      const out = await c.readUntil(/event: htmx:fe:sideEffects\n/)
      expect(out).to.match(/hx-target="#op-field--[^"]+--content"|hx-target="#op-field--[^"]+--totalPages"/)
    } finally {
      await POST(`/htmx/catalog/Books(${DRAFT})/$discard`, {}, { headers: c.headers })
    }
  })

  test('onChange() ignores changes on active (non-draft) objects', async () => {
    const { expect } = api
    const c = await open('active')
    const srv = cds.services.CatalogService
    const view = { service: srv.name, servicePath: '/odata/v4/catalog/', entityType: 'CatalogService.Books', keys: { ID: BOOK_ID, IsActiveEntity: true }, contextPath: '/Books', basePath: '/htmx/catalog', entitySetPath: `Books(${ACTIVE})` }
    await srv.tx(tx => engine.onChange(tx, view, { clientId: c.clientId, properties: ['stock'] }))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(c.seen()).not.to.include('hx-partial')
  })

  test('collectTargets() normalises string and wrapper targets, wildcards and DraftMessages', () => {
    const { expect } = api
    const t = engine.collectTargets([
      { TargetProperties: ['a', { $PropertyPath: 'b/c' }, 'DraftMessages'], TargetEntities: [{ $NavigationPropertyPath: 'chapters' }] },
      { TargetProperties: [] }
    ])
    expect([...t.properties]).to.deep.equal(['a', 'b/c'])
    expect([...t.entities]).to.deep.equal(['chapters'])
    expect(t.all).to.equal(false)
    expect(engine.collectTargets([{ TargetProperties: ['*'] }]).all).to.equal(true)
    expect(engine.collectTargets([{ TargetEntities: [''] }]).all).to.equal(true)
  })
})
