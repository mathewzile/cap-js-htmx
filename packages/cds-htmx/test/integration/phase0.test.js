const cds = require('@sap/cds')
const path = require('node:path')
const api = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const channels = require('../../lib/sse/channels')
const stream = require('../../lib/sse/stream')

describe('Phase 0 spikes', () => {

  test('serves @odata and @htmx for the same service simultaneously', async () => {
    const { GET, expect } = api
    const odata = await GET('/odata/v4/catalog/Books?$top=1')
    expect(odata.status).to.equal(200)

    const home = await GET('/htmx/catalog/')
    expect(home.status).to.equal(200)
    expect(home.headers['content-type']).to.match(/text\/html/)
    expect(home.data).to.match(/<html/)
  })

  test('renders a full page without HX-Request, a fragment with it', async () => {
    const { GET, expect } = api

    const full = await GET('/htmx/catalog/')
    expect(full.data).to.match(/<html/)
    expect(full.data).to.match(/<div id="app"/)

    const fragment = await GET('/htmx/catalog/', { headers: { 'HX-Request': 'true' } })
    expect(fragment.data).not.to.match(/<html/)
    expect(fragment.data).to.match(/^<title>/)
  })

  test('full page history-restore request still renders the full document', async () => {
    const { GET, expect } = api
    const restored = await GET('/htmx/catalog/', {
      headers: { 'HX-Request': 'true', 'HX-History-Restore-Request': 'true' }
    })
    expect(restored.data).to.match(/<html/)
  })

  test('lean draft create -> activate recomputes stockStatus via the service handlers', async () => {
    const { GET, POST, expect } = api

    const authors = await GET('/odata/v4/catalog/Authors?$top=1')
    const author_ID = authors.data.value[0].ID

    const draft = await POST('/odata/v4/catalog/Books', { title: 'Spike Draft Book', author_ID, stock: 5 })
    expect(draft.status).to.equal(201)
    expect(draft.data.IsActiveEntity).to.equal(false)

    const { ID } = draft.data
    const saved = await POST(
      `/odata/v4/catalog/Books(ID=${ID},IsActiveEntity=false)/CatalogService.draftActivate`, {}
    )
    expect(saved.status).to.equal(201)
    expect(saved.data.IsActiveEntity).to.equal(true)
    expect(saved.data.stockStatus).to.equal('Low Stock')
    expect(saved.data.stockCriticality).to.equal(2)
  })

  test('an <hx-partial> pushed over SSE arrives with the SSE wire format intact, independent of the connecting element\'s own hx-swap="none"', async () => {
    const clientId = 'spike-b-' + Date.now()
    const res = await fetch(`${api.url}/htmx/catalog/$events?client=${clientId}`, {
      headers: { Accept: 'text/event-stream' }
    })
    const { expect } = api
    expect(res.status).to.equal(200)
    expect(res.headers.get('content-type')).to.match(/text\/event-stream/)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const readUntil = async pattern => {
      while (!pattern.test(buffer)) {
        const { value, done } = await reader.read()
        if (done) throw new Error('SSE stream closed before expected data arrived')
        buffer += decoder.decode(value, { stream: true })
      }
    }

    // initial handshake event sent by HtmxAdapter#events
    await readUntil(/event: connected\ndata: [^\n]+\n\n/)

    // simulate a side-effect push the way side-effects-engine.js will do it in Phase 6
    const client = channels.get(clientId)
    expect(client).to.not.equal(undefined)
    const partial = '<hx-partial hx-target="#op-field--stockStatus" hx-swap="outerMorph">Low Stock</hx-partial>'
    stream.write(client.res, { event: 'sideEffects', data: partial, id: 1 })

    await readUntil(/event: sideEffects\n/)
    expect(buffer).to.match(/^id: 1\nevent: sideEffects\n/m)
    expect(buffer).to.match(/data: <hx-partial hx-target="#op-field--stockStatus" hx-swap="outerMorph">Low Stock<\/hx-partial>\n\n$/)

    reader.cancel()
    channels.remove(clientId)
  })
})
