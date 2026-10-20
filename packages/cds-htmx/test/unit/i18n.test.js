const assert = require('node:assert/strict')
const { test } = require('node:test')

const i18n = require('../../lib/i18n')

test('bundleFor() merges the plugin chrome bundle with the model app bundle', () => {
  const bundle = i18n.bundleFor(require('node:path').join(__dirname, '..', '..', '..', '..', 'app'))
  assert.equal(bundle.Go, 'Go') // plugin's own _i18n/i18n.properties
  assert.equal(bundle.Book, 'Book') // app/_i18n/i18n.properties
  assert.equal(bundle.Books, 'Books')
})

test('bundleFor() without an appRoot still returns the plugin chrome bundle', () => {
  const bundle = i18n.bundleFor(undefined)
  assert.equal(bundle.Go, 'Go')
  assert.equal(bundle.Book, undefined)
})

test('resolveText() resolves a {i18n>Key} placeholder and falls back to the key when missing', () => {
  const bundle = { Book: 'Book' }
  assert.equal(i18n.resolveText('{i18n>Book}', bundle), 'Book')
  assert.equal(i18n.resolveText('{i18n>Missing}', bundle), 'Missing')
  assert.equal(i18n.resolveText('plain text', bundle), 'plain text')
  assert.equal(i18n.resolveText(42, bundle), 42)
})

test('t() looks up a plain chrome key directly (not {i18n>...}-wrapped)', () => {
  const bundle = { Go: 'Go', AdaptFilters: 'Adapt Filters' }
  assert.equal(i18n.t(bundle, 'Go'), 'Go')
  assert.equal(i18n.t(bundle, 'Unknown'), 'Unknown')
})

test('translate() deep-walks objects/arrays/Maps, leaving expressions and non-strings untouched', () => {
  const bundle = { Book: 'Book', Books: 'Books' }
  const tree = {
    header: { typeName: '{i18n>Book}', typeNamePlural: '{i18n>Books}' },
    columns: [{ label: '{i18n>Book}', hidden: { $Path: 'someFlag' }, importance: null }],
    byPath: new Map([['stock', { label: '{i18n>Book}' }]])
  }
  const out = i18n.translate(tree, bundle)
  assert.equal(out.header.typeName, 'Book')
  assert.equal(out.header.typeNamePlural, 'Books')
  assert.equal(out.columns[0].label, 'Book')
  assert.deepEqual(out.columns[0].hidden, { $Path: 'someFlag' })
  assert.equal(out.columns[0].importance, null)
  assert.equal(out.byPath.get('stock').label, 'Book')
})
