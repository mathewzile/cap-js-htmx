// sap.htmx.animations: `full` (default), `fast` (durations a quarter as long) or `none`; true / false are the old form of full / none.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { GET } = cds.test(path.join(__dirname, '..', '..', '..', '..'))
const { scanManifest, scanService, motionOf } = require('../../lib/annotations/manifest')
const cache = require('../../lib/model/cache')
const layout = require('../../lib/render/layout')

const HX = { 'HX-Request': 'true' }
const manifest = animations => ({ 'sap.app': { dataSources: { mainService: { uri: '/admin/', type: 'OData' } } }, 'sap.htmx': animations === undefined ? {} : { animations } })

describe('animations (sap.htmx.animations)', () => {
  test('the manifest value is a motion mode; booleans are the old form', () => {
    for (const [value, mode] of [[undefined, 'full'], [true, 'full'], ['full', 'full'], ['fast', 'fast'], [false, 'none'], ['none', 'none'], ['nonsense', 'full']]) {
      assert.equal(motionOf(value), mode, String(value))
      assert.equal(scanManifest(manifest(value), '/admin/').animations, mode, String(value))
    }
  })

  test('the service-wide answer; an app bundle answers for itself', () => {
    const app = value => ({ scanFor: () => scanManifest(manifest(value), '/admin/') })
    assert.equal(cache.animationsFor('/admin/', { app: app('fast') }), 'fast')
    assert.equal(cache.animationsFor('/admin/', { app: app(false) }), 'none')
    assert.equal(cache.animationsFor('/admin/', { app: app(undefined) }), 'full')
    assert.equal(cache.animationsFor('/odata/v4/catalog/', { appRoot: path.join(__dirname, '..', '..', '..', '..', 'app') }), 'full')
  })

  test('with several manifests for a service the calmest wins (none over fast over full)', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'))
    try {
      for (const [name, value] of [['a', 'fast'], ['b', undefined], ['c', 'full']]) {
        fs.mkdirSync(path.join(dir, name, 'webapp'), { recursive: true })
        fs.writeFileSync(path.join(dir, name, 'webapp', 'manifest.json'), JSON.stringify(manifest(value)))
      }
      assert.equal(scanService(dir, '/admin/').animations, 'fast')
      fs.mkdirSync(path.join(dir, 'd', 'webapp'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'd', 'webapp', 'manifest.json'), JSON.stringify(manifest(false)))
      assert.equal(scanService(dir, '/admin/').animations, 'none')
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  test('the page carries the class of its motion', () => {
    const body = animations => /<body class="([^"]*)"/.exec(String(layout.page({ title: 't', body: '', animations })))[1]
    assert.equal(body('none'), 'htmx-fiori is-compact hf-no-motion')
    assert.equal(body('fast'), 'htmx-fiori is-compact hf-motion-fast')
    assert.equal(body('full'), 'htmx-fiori is-compact')
    assert.equal(body(undefined), 'htmx-fiori is-compact')
  })

  test('$shell tells the shell (Work Zone) the app\'s motion', async () => {
    assert.equal((await GET('/htmx/admin/$shell', { headers: HX })).data.animations, 'full')
  })
})
