const assert = require('node:assert/strict')
const { test } = require('node:test')
const { columnBreakpoints, columnVisibilityStyle } = require('../../lib/render/table')

const col = (path, extra = {}) => ({ kind: 'UI.DataField', field: { path, cqlPath: path }, ...extra })
const rows = [{ title: 'a', author: 'b', stock: 1, genre: 'c' }]

test('columnBreakpoints(): first column always visible, others hidden by accumulated width', () => {
  const bp = columnBreakpoints([col('title'), col('author'), col('stock')], rows)
  assert.equal(bp[0], undefined)
  // 2rem selection + 2.75rem nav + 18rem title + 18rem author = 652px; + 6rem numeric stock
  assert.equal(bp[1], 652)
  assert.equal(bp[2], 748)
})

test('columnBreakpoints(): UI.Importance High is kept longest, Low dropped first', () => {
  const bp = columnBreakpoints([
    col('title'),
    col('author', { importance: { $EnumMember: 'UI.ImportanceType/Low' } }),
    col('genre', { importance: 'High' })
  ], rows)
  assert.ok(bp[2] < bp[1])
})

test('columnBreakpoints(): HTML5.CssDefaults.width overrides the estimate', () => {
  const bp = columnBreakpoints([col('title'), col('author', { width: '10rem' })], rows, { selectable: false })
  assert.equal(bp[1], Math.round((2.75 + 18 + 10) * 16))
})

test('columnVisibilityStyle() emits scoped container queries', () => {
  const css = columnVisibilityStyle('#lr-table', [col('title'), col('author')], rows).value
  assert.match(css, /@container hf-table \(max-width: 651px\) \{ #lr-table \.hf-col-1 \{ display: none; \} \}/)
})
