const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const assets = require('../../lib/assets')
const HX = { 'HX-Request': 'true' }
const raw = (url, init) => fetch(api.axios.defaults.baseURL + url, init)

describe('phase 9: what the BTP deployment needs from the backend', () => {

  describe('writes need HX-Request (CSRF defense in depth)', () => {
    test('a POST, PATCH or DELETE without it is refused before it reaches any handler', async () => {
      for (const [method, url] of [['POST', '/htmx/catalog/Books'], ['PATCH', '/htmx/catalog/Books(ID=1,IsActiveEntity=false)/$field/title'], ['DELETE', '/htmx/catalog/Books']]) {
        const res = await raw(url, { method })
        assert.equal(res.status, 403, method)
        assert.match(await res.text(), /HX-Request/)
      }
    })

    test('with it the request is handled as before', async () => {
      const res = await raw('/htmx/catalog/Books/$delete', { method: 'POST', headers: HX })
      assert.notEqual(res.status, 403)
    })

    test('reads never need it', async () => {
      assert.equal((await raw('/htmx/catalog/Books')).status, 200)
    })
  })

  describe('sticky sessions', () => {
    test('a full page and the event stream set a JSESSIONID cookie once, a fragment does not', async () => {
      const page = await raw('/htmx/catalog/Books')
      const cookie = page.headers.get('set-cookie')
      assert.match(cookie, /^JSESSIONID=[0-9a-f-]{36}; Path=\/; HttpOnly; SameSite=Lax/)
      const again = await raw('/htmx/catalog/Books', { headers: { cookie: cookie.split(';')[0] } })
      assert.equal(again.headers.get('set-cookie'), null, 'a browser that has one keeps it')
      assert.equal((await raw('/htmx/catalog/Books', { headers: HX })).headers.get('set-cookie'), null)
    })

    test('behind a TLS-terminating proxy the cookie is Secure', async () => {
      const res = await raw('/htmx/catalog/Books', { headers: { 'x-forwarded-proto': 'https' } })
      assert.match(res.headers.get('set-cookie'), /; Secure$/)
    })
  })

  describe('versioned assets', () => {
    test('pages address every asset under /htmx/-/v<version>/, with the app base in front when there is one', async () => {
      const html = await (await raw('/htmx/catalog/Books')).text()
      assert.match(html, new RegExp(`href="/htmx/-/v${assets.version}/fundamental-styles/fundamental-styles.css"`))
      assert.match(html, new RegExp(`src="/htmx/-/v${assets.version}/public/htmx-fiori.js"`))
    })

    test('a versioned file is cached for a year and never revalidated', async () => {
      const res = await raw(`/htmx/-/v${assets.version}/public/htmx-fiori.css`)
      assert.equal(res.status, 200)
      assert.match(res.headers.get('cache-control'), /max-age=31536000, immutable/)
    })

    test('the version follows the content of the plugin files', () => {
      assert.match(assets.version, /^[0-9a-f]{10}$/)
    })
  })

  describe('GET /$shell', () => {
    test('tells a shell where the versioned assets, the themes and the texts are, under its own base', async () => {
      const res = await raw('/htmx/catalog/$shell', { headers: { 'X-Htmx-Base': '/cap.managebooks-1.0.0' } })
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
      const info = await res.json()
      assert.equal(info.version, assets.version)
      assert.equal(info.scripts.htmx, `/cap.managebooks-1.0.0/htmx/-/v${assets.version}/htmx.org/htmx.min.js`)
      assert.deepEqual(Object.keys(info.themes), ['sap_horizon', 'sap_horizon_dark', 'sap_horizon_hcb', 'sap_horizon_hcw'])
      assert.equal(info.texts.Go, 'Go')
      assert.equal(info.servicePath, '/cap.managebooks-1.0.0/htmx/catalog')
    })
  })

  describe('the event stream passes proxies untouched', () => {
    test('Cache-Control: no-transform, so the approuter does not compress (and so buffer) it', async () => {
      const controller = new AbortController()
      const res = await raw('/htmx/catalog/$events?client=phase9', { headers: { Accept: 'text/event-stream' }, signal: controller.signal })
      assert.equal(res.headers.get('content-type'), 'text/event-stream')
      assert.match(res.headers.get('cache-control'), /no-transform/)
      controller.abort()
    })
  })
})
