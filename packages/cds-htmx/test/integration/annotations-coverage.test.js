const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { test } = require('node:test')

cds.test(path.join(__dirname, '..', '..', '..', '..'))

const { build } = require('../../lib/annotations/store')
const { statusOf, coverage } = require('../../lib/annotations/registry')
const appRoot = path.join(__dirname, '..', '..', '..', '..', 'app')

test('statusOf() classifies representative terms from every vocabulary', () => {
  assert.equal(statusOf('UI', 'LineItem'), 'supported')
  assert.equal(statusOf('UI', 'Chart'), 'partial')
  assert.equal(statusOf('UI', 'Badge'), 'ignored')
  assert.equal(statusOf('Common', 'SideEffects'), 'supported')
  assert.equal(statusOf('Analytics', 'AggregatedProperty'), 'ignored')
  assert.equal(statusOf('UI', 'SomeFutureTermThatDoesNotExistYet'), 'unknown')
})

test('coverage(): the full sample model (CatalogService + XML layer) has zero unknown terms', () => {
  const model = cds.model
  const store = build(model, 'CatalogService', '/odata/v4/catalog/', { appRoot })
  const report = coverage(store)

  if (report.unknown.length) {
    const list = report.unknown.map(u => `${u.target} @${u.alias}.${u.term}`).join('\n')
    assert.fail(`found ${report.unknown.length} unknown term(s):\n${list}`)
  }
  assert.ok(report.supported.length > 0)
})
