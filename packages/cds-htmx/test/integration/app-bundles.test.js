const cds = require('@sap/cds')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const apps = require('../../lib/apps')
const { checkRel } = require('../../lib/apps/bundle')
const cache = require('../../lib/model/cache')
const channels = require('../../lib/sse/channels')
const { scanManifest } = require('../../lib/annotations/manifest')

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'apps')
const ALPHA = 'fixture.alpha@1.2.0'
const BETA = 'fixture.beta@1.2.0'
const LOCAL = [{ kind: 'local', root: FIXTURES }, { kind: 'local' }]

function configure(overrides) {
  cds.env.htmx = { ...cds.env.htmx, apps: { ...cds.env.htmx.apps, ...overrides } }
  apps.reset()
}

describe('App bundles and app-scoped rendering (Phase 7)', () => {
  const original = {}
  before(() => { original.apps = cds.env.htmx.apps; configure({ sources: LOCAL, allow: ['*'] }) })
  after(() => { cds.env.htmx = { ...cds.env.htmx, apps: original.apps }; apps.reset() })

  describe('unit', () => {
    test('parseRef() accepts id@version only', () => {
      assert.deepEqual(apps.parseRef('fixture.alpha@1.2.0'), { id: 'fixture.alpha', version: '1.2.0' })
      for (const bad of ['', 'alpha', '../x@1', 'a b@1', 'a@', '@1', 'a@1/../2', undefined, 'a@1@2']) {
        assert.throws(() => apps.parseRef(bad), { message: 'Invalid X-Htmx-App' }, String(bad))
      }
    })

    test('compareVersions() compares numerically and reports unorderable versions as NaN', () => {
      assert.equal(apps.compareVersions('1.2.10', '1.2.9'), 1)
      assert.equal(apps.compareVersions('1.0', '1.0.0'), 0)
      assert.equal(apps.compareVersions('0.9.9', '1.0.0'), -1)
      assert.ok(Number.isNaN(apps.compareVersions('1.0.0-beta', '1.0.0')))
    })

    test('checkRel() only lets plain relative declarative files through', () => {
      for (const ok of ['annotations/annotation.xml', 'i18n/i18n.properties', 'ext/fragment/Foo.fragment.html', 'manifest.json']) assert.equal(checkRel(ok), ok)
      for (const bad of ['../secret.xml', 'a/../../b.xml', '/etc/passwd.xml', 'https://evil/x.xml', '//evil/x.xml', 'a\b.xml', 'ext/run.js', 'x.xml?y=1', '', null]) {
        assert.throws(() => checkRel(bad), { message: /App file not allowed/ }, String(bad))
      }
    })

    test('scanManifest() reads annotation URIs and page settings for the matching service only', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'alpha', 'webapp', 'manifest.json'), 'utf8'))
      manifest['sap.ui5'] = { routing: { targets: { lr: { name: 'sap.fe.templates.ListReport', options: { settings: { contextPath: '/Books', initialLoad: true } } } } } }
      const scan = scanManifest(manifest, '/odata/v4/catalog')
      assert.deepEqual(scan.annotationUris, ['annotations/annotation.xml'])
      assert.equal(scan.listReports['/Books'].initialLoad, true)
      assert.equal(scanManifest(manifest, '/odata/v4/other/'), null)
    })
  })

  describe('rendering per app', () => {
    const lr = (app, extra = {}) => api.GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': app, ...extra } })

    test('without X-Htmx-App the merged app/ folder scan still applies', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Books')
      expect(res.data).to.include('Book Title (XML override)')
      expect(res.data).to.match(/<html/)
    })

    test('two apps on one service render different List Reports', async () => {
      const { expect } = api
      const a = (await lr(ALPHA)).data
      const b = (await lr(BETA)).data
      expect(a).to.include('Alpha Title')
      expect(a).to.include('Alpha Stock Level') // {i18n>} resolved from the app's own bundle
      expect(a).not.to.include('Beta Price')
      expect(a).not.to.include('Book Title (XML override)') // the app/ folder layer does not leak in
      expect(b).to.include('Beta Price')
      expect(b).to.include('Beta Writer')
      expect(b).not.to.include('Alpha Title')
    })

    test('an app request is answered with a fragment even without HX-Request (shell mode)', async () => {
      const { expect } = api
      const res = await lr(ALPHA)
      expect(res.data).not.to.match(/<html/)
      expect(res.data).to.match(/^<title>/)
    })

    test('the app bundle is picked per locale', async () => {
      const { expect } = api
      const de = await lr(ALPHA, { 'Accept-Language': 'de' })
      expect(de.data).to.include('Alpha Bestand')
      const en = await lr(ALPHA, { 'Accept-Language': 'en' })
      expect(en.data).to.include('Alpha Stock Level')
    })

    test('the Object Page of an app request renders', async () => {
      const { GET, expect } = api
      const res = await GET("/htmx/catalog/Books(ID='3d2d2d2d-1c1c-4b4b-8a8a-000000000001',IsActiveEntity=true)", { headers: { 'X-Htmx-App': BETA } })
      expect(res.status).to.equal(200)
      expect(res.data).to.include('Wuthering Heights')
    })

    test('app caches are separate: stores and layouts differ per app and are reused per app', async () => {
      const { expect } = api
      await lr(ALPHA)
      await lr(BETA)
      const a = (await apps.resolve(ALPHA)).app
      const b = (await apps.resolve(BETA)).app
      const opts = { appRoot: path.join(__dirname, '..', '..', '..', '..', 'app') }
      const sa = cache.storeFor(cds.model, 'CatalogService', '/odata/v4/catalog/', { ...opts, app: a })
      const sb = cache.storeFor(cds.model, 'CatalogService', '/odata/v4/catalog/', { ...opts, app: b })
      const plain = cache.storeFor(cds.model, 'CatalogService', '/odata/v4/catalog/', opts)
      expect(sa).not.to.equal(sb)
      expect(sa).not.to.equal(plain)
      expect(cache.storeFor(cds.model, 'CatalogService', '/odata/v4/catalog/', { ...opts, app: a })).to.equal(sa)
    })
  })

  describe('validation', () => {
    const get = headers => api.axios.get('/htmx/catalog/Books', { headers, validateStatus: () => true })

    test('malformed, unknown and disallowed apps are rejected', async () => {
      const { expect } = api
      expect((await get({ 'X-Htmx-App': '../../etc/passwd@1' })).status).to.equal(400)
      expect((await get({ 'X-Htmx-App': 'no-version' })).status).to.equal(400)
      expect((await get({ 'X-Htmx-App': 'does.not.exist@1.0.0' })).status).to.equal(404)

      configure({ sources: LOCAL, allow: ['fixture.*'] })
      expect((await get({ 'X-Htmx-App': 'managebooks@0.0.1' })).status).to.equal(403)
      expect((await get({ 'X-Htmx-App': ALPHA })).status).to.equal(200)
      configure({ sources: LOCAL, allow: ['*'] })
    })

    test('X-Htmx-Base must be a plain absolute path', async () => {
      const { expect } = api
      for (const base of ['//evil.example', 'http://evil.example', '/a/../b', '/a b', 'relative', '/x//y', "/<script>"]) {
        expect((await get({ 'X-Htmx-App': ALPHA, 'X-Htmx-Base': base })).status, base).to.equal(400)
      }
    })
  })

  describe('URL base (Work Zone approuter prefix)', () => {
    const BASE = '/cap-htmx.fixture.alpha-1.2.0'

    test('every generated URL carries the base', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA, 'X-Htmx-Base': BASE + '/' } })
      expect(res.data).to.include(`hx-get="${BASE}/htmx/catalog/Books/$table`)
      // no URL generated for the service escapes the prefix
      const urls = [...res.data.matchAll(/(?:hx-get|hx-post|hx-patch|hx-delete|href)="(\/[^"]*)"/g)].map(m => m[1])
      expect(urls.length).to.be.greaterThan(0)
      for (const url of urls) expect(url.startsWith(BASE + '/htmx/catalog'), url).to.equal(true)
    })

    test('history URLs and row links carry the base too', async () => {
      const { GET, POST, expect } = api
      const headers = { 'X-Htmx-App': ALPHA, 'X-Htmx-Base': BASE }
      const list = await GET('/htmx/catalog/Books', { headers })
      expect(list.data).to.match(new RegExp(`hx-get="${BASE}/htmx/catalog/Books\\(ID=`))
      const created = await POST('/htmx/catalog/Books', {}, { headers })
      expect(created.headers['hx-push-url']).to.match(new RegExp(`^${BASE}/htmx/catalog/Books\\(`))
      const raw = created.headers['hx-push-url'].match(/Books\(([^)]*)\)/)[1]
      await POST(`/htmx/catalog/Books(${raw})/$discard`, {}, { headers })
    })

    test('without a base nothing changes', async () => {
      const { GET, expect } = api
      const res = await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA } })
      expect(res.data).to.include('hx-get="/htmx/catalog/Books/$table')
    })
  })

  describe('version skew', () => {
    test('an older browser version gets HX-Trigger hf:appUpdated; the current one does not', async () => {
      const { GET, expect } = api
      const old = await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': 'fixture.alpha@1.0.0' } })
      expect(old.headers['hx-trigger']).to.equal('{"hf:appUpdated":""}') // JSON, so it can sit beside other events of the response
      const current = await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA } })
      expect(current.headers['hx-trigger']).to.equal(undefined)
      const newer = await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': 'fixture.alpha@2.0.0' } })
      expect(newer.headers['hx-trigger']).to.equal(undefined)
    })
  })

  describe('SSE', () => {
    test('the channel remembers the app, and so does the view', async () => {
      const { GET, expect } = api
      const clientId = `app-${Date.now()}`
      const res = await fetch(`${api.url}/htmx/catalog/$events?client=${clientId}`, { headers: { Accept: 'text/event-stream', 'X-Htmx-App': ALPHA } })
      const reader = res.body.getReader()
      await reader.read()
      try {
        expect(channels.get(clientId).app).to.equal(ALPHA)
        await GET('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA, 'X-Htmx-Client': clientId } })
        expect(channels.get(clientId).view.app.ref).to.equal(ALPHA)
      } finally {
        await reader.cancel()
        channels.remove(clientId)
      }
    })
  })

  describe('value help route (previously called a missing cache function)', () => {
    test('GET $vh/author_ID on a draft returns the dialog', async () => {
      const { POST, GET, expect } = api
      const created = await POST('/htmx/catalog/Books', {}, { headers: { 'HX-Request': 'true' } })
      const raw = created.headers['hx-push-url'].match(/Books\(([^)]*)\)/)[1]
      try {
        const res = await GET(`/htmx/catalog/Books(${raw})/$vh/author_ID`, { headers: { 'HX-Request': 'true' } })
        expect(res.status).to.equal(200)
        expect(res.data).to.match(/Select: [^<]+/)
      } finally {
        await POST(`/htmx/catalog/Books(${raw})/$discard`, {}, { headers: { 'HX-Request': 'true' } })
      }
    })
  })

  describe('local source', () => {
    const os = require('node:os')
    let dir
    before(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htmx-apps-'))
      fs.cpSync(path.join(FIXTURES, 'alpha'), path.join(dir, 'alpha'), { recursive: true })
      configure({ sources: [{ kind: 'local', root: dir }], localRecheck: 0 })
    })
    after(() => { fs.rmSync(dir, { recursive: true, force: true }); configure({ sources: LOCAL, localRecheck: 1000 }) })

    test('an edited annotation.xml is picked up without a restart', async () => {
      const { GET, expect } = api
      const headers = { 'X-Htmx-App': ALPHA }
      expect((await GET('/htmx/catalog/Books', { headers })).data).to.include('Alpha Title')
      const file = path.join(dir, 'alpha', 'webapp', 'annotations', 'annotation.xml')
      await new Promise(resolve => setTimeout(resolve, 20)) // mtime granularity
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Alpha Title', 'Alpha Renamed'))
      const res = await GET('/htmx/catalog/Books', { headers })
      expect(res.data).to.include('Alpha Renamed')
      expect(res.data).not.to.include('Alpha Title')
    })

    test('an unchanged app keeps its loaded instance (and its caches)', async () => {
      const { expect } = api
      const first = (await apps.resolve(ALPHA)).app
      const second = (await apps.resolve(ALPHA)).app
      expect(second).to.equal(first)
    })

    test('a path-escaping localUri in a local manifest is refused', async () => {
      const { expect } = api
      const manifestFile = path.join(dir, 'alpha', 'webapp', 'manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      manifest['sap.app'].dataSources.annotation.settings.localUri = '../../../outside.xml'
      await new Promise(resolve => setTimeout(resolve, 20))
      fs.writeFileSync(manifestFile, JSON.stringify(manifest))
      // already loaded apps keep being served when a refresh fails (tested below); a first load must fail
      const served = await api.axios.get('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA } })
      expect(served.data).to.include('Alpha Renamed')
      apps.reset()
      const res = await api.axios.get('/htmx/catalog/Books', { headers: { 'X-Htmx-App': ALPHA }, validateStatus: () => true })
      expect(res.status).to.equal(502)
    })
  })

  describe('destination source (pull over HTTP)', () => {
    let server
    let url
    const hits = []
    const files = {}

    before(async () => {
      const walk = (dir, prefix) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = prefix + entry.name
          if (entry.isDirectory()) walk(path.join(dir, entry.name), rel + '/')
          else files[rel] = fs.readFileSync(path.join(dir, entry.name), 'utf8')
        }
      }
      for (const name of ['alpha', 'beta']) walk(path.join(FIXTURES, name, 'webapp'), `fixture.${name}/`)
      files['evil.app/manifest.json'] = JSON.stringify({ 'sap.app': { id: 'evil.app', applicationVersion: { version: '1.0.0' }, dataSources: { a: { type: 'ODataAnnotation', settings: { localUri: '../../secret.xml' } } } } })
      files['liar.app/manifest.json'] = JSON.stringify({ 'sap.app': { id: 'someone.else', applicationVersion: { version: '1.0.0' } } })
      files['big.app/manifest.json'] = JSON.stringify({ 'sap.app': { id: 'big.app', applicationVersion: { version: '1.0.0' }, dataSources: { a: { type: 'ODataAnnotation', settings: { localUri: 'annotations/annotation.xml' } } } } })
      files['big.app/annotations/annotation.xml'] = 'x'.repeat(3 * 1024 * 1024)
      server = http.createServer((req, res) => {
        hits.push(req.url)
        const body = files[decodeURIComponent(req.url).slice(1)]
        if (body == null) { res.writeHead(404); return res.end() }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(body)
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      url = `http://127.0.0.1:${server.address().port}`
      configure({ sources: [{ kind: 'destination', url }], ttl: 60000 })
    })
    after(async () => { await new Promise(resolve => server.close(resolve)); configure({ sources: LOCAL }) })

    const get = headers => api.axios.get('/htmx/catalog/Books', { headers, validateStatus: () => true })

    test('renders from the pulled bundle, with the same result as the local source', async () => {
      const { expect } = api
      const res = await get({ 'X-Htmx-App': ALPHA })
      expect(res.status).to.equal(200)
      expect(res.data).to.include('Alpha Title')
      expect(res.data).to.include('Alpha Stock Level')
      expect(hits).to.include('/fixture.alpha/manifest.json')
      expect(hits).to.include('/fixture.alpha/annotations/annotation.xml')
    })

    test('the bundle is cached: further requests do not hit the source', async () => {
      const { expect } = api
      const before = hits.length
      await get({ 'X-Htmx-App': ALPHA })
      await get({ 'X-Htmx-App': ALPHA })
      expect(hits.length).to.equal(before)
    })

    test('a locale variant is pulled lazily, once', async () => {
      const { expect } = api
      const res = await get({ 'X-Htmx-App': ALPHA, 'Accept-Language': 'de' })
      expect(res.data).to.include('Alpha Bestand')
      expect(hits).to.include('/fixture.alpha/i18n/i18n_de.properties')
      const count = hits.filter(h => h.endsWith('i18n_de.properties')).length
      await get({ 'X-Htmx-App': ALPHA, 'Accept-Language': 'de' })
      expect(hits.filter(h => h.endsWith('i18n_de.properties')).length).to.equal(count)
    })

    test('unknown app: 404, and the failure is cached briefly', async () => {
      const { expect } = api
      expect((await get({ 'X-Htmx-App': 'nobody@1.0.0' })).status).to.equal(404)
      const before = hits.length
      expect((await get({ 'X-Htmx-App': 'nobody@1.0.0' })).status).to.equal(404)
      expect(hits.length).to.equal(before)
    })

    test('a manifest that names files outside the app, or another id, or too much data is refused (502)', async () => {
      const { expect } = api
      expect((await get({ 'X-Htmx-App': 'evil.app@1.0.0' })).status).to.equal(502)
      expect((await get({ 'X-Htmx-App': 'liar.app@1.0.0' })).status).to.equal(502)
      expect((await get({ 'X-Htmx-App': 'big.app@1.0.0' })).status).to.equal(502)
      expect(hits.some(h => h.includes('secret'))).to.equal(false)
    })

    test('a changed app is picked up when the browser reports a newer version (rate limited)', async () => {
      const { expect } = api
      configure({ sources: [{ kind: 'destination', url }], ttl: 60000, refetchInterval: 0 })
      await get({ 'X-Htmx-App': ALPHA })
      files['fixture.alpha/manifest.json'] = files['fixture.alpha/manifest.json'].replace('1.2.0', '1.3.0')
      const stale = await get({ 'X-Htmx-App': ALPHA })
      expect(stale.headers['hx-trigger']).to.equal(undefined) // header still equals what is cached... until re-fetched
      const fresh = await get({ 'X-Htmx-App': 'fixture.alpha@1.3.0' })
      expect(fresh.status).to.equal(200)
      expect((await apps.resolve('fixture.alpha@1.3.0')).app.version).to.equal('1.3.0')
      const old = await get({ 'X-Htmx-App': ALPHA })
      expect(old.headers['hx-trigger']).to.equal('{"hf:appUpdated":""}') // JSON, so it can sit beside other events of the response
    })

    test('a failing refresh keeps serving the cached app', async () => {
      const { expect } = api
      configure({ sources: [{ kind: 'destination', url }], ttl: 0 })
      expect((await get({ 'X-Htmx-App': 'fixture.beta@1.2.0' })).status).to.equal(200)
      delete files['fixture.beta/manifest.json']
      const res = await get({ 'X-Htmx-App': 'fixture.beta@1.2.0' })
      expect(res.status).to.equal(200)
      expect(res.data).to.include('Beta Price')
    })
  })
})
