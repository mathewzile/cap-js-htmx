const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { findManifests, scanService } = require('../../../lib/annotations/manifest')

const appRoot = path.join(__dirname, '..', '..', '..', '..', '..', 'app')

test('findManifests() locates the manage-books app under app/**/webapp/manifest.json', () => {
  const manifests = findManifests(appRoot)
  assert.ok(manifests.some(p => p.endsWith(path.join('manage-books', 'webapp', 'manifest.json'))))
})

test('scanService() matches the manifest whose dataSource uri equals the service path', () => {
  const result = scanService(appRoot, '/odata/v4/catalog/')
  // manage-books and manage-books-htmx (the Work Zone app) both use this service; each has its own annotation.xml
  assert.equal(result.annotationFiles.length, 2)
  assert.ok(result.annotationFiles.every(file => file.endsWith(path.join('annotations', 'annotation.xml'))))

  assert.ok(result.listReports['/Books'])
  assert.equal(result.listReports['/Books'].variantManagement, 'Page')

  assert.ok(result.objectPages['/Books'])
  assert.equal(result.objectPages['/Books'].editableHeaderContent, false)
  assert.ok(result.objectPages['/Books/chapters'])
})

test('scanService() ignores manifests pointing at a different service', () => {
  const result = scanService(appRoot, '/odata/v4/some-other-service/')
  assert.deepEqual(result.annotationFiles, [])
  assert.deepEqual(result.listReports, {})
  assert.deepEqual(result.objectPages, {})
})

test('trailing-slash differences between manifest uri and servicePath do not break the match', () => {
  const result = scanService(appRoot, '/odata/v4/catalog')
  assert.equal(result.annotationFiles.length, 2)
})
