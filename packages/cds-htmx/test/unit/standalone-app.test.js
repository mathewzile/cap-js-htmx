const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { standaloneApp } = require('../../lib/apps/standalone')

const root = path.join(__dirname, '..', '..', '..', '..', 'app')

test('the standalone app is one per root and parses the annotation files once per service', () => {
  const app = standaloneApp(root)
  assert.equal(standaloneApp(root), app)
  const first = app.scanFor('/odata/v4/catalog/')
  assert.ok(first.layers.length >= 1)
  assert.equal(app.scanFor('/odata/v4/catalog/'), first) // the same scan, not parsed again
})

test('without a root the standalone app says nothing: only the service annotations remain', () => {
  const scan = standaloneApp(undefined).scanFor('/odata/v4/catalog/')
  assert.deepEqual(scan.layers, [])
  assert.deepEqual(scan.listReports, {})
  assert.equal(scan.animations, 'full')
})
