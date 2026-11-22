const assert = require('node:assert/strict')
const { test } = require('node:test')
const { chartSvg, chartTypeName, niceScale } = require('../../lib/render/chart')

const dimensions = [{ path: 'name', label: 'Name' }]
const measures = [{ path: 'a', label: 'A' }, { path: 'b', label: 'B' }]
const rows = [{ name: 'x', a: 10, b: 5 }, { name: 'y', a: 20, b: 8 }, { name: 'z', a: 0, b: 12 }]
const draw = (type, m = measures) => String(chartSvg({ type, title: 'T', dimensions, measures: m }, rows))
const count = (s, re) => (s.match(re) ?? []).length

test('chart type names: the enum member, a bare name, and a default', () => {
  assert.equal(chartTypeName({ $EnumMember: 'UI.ChartType/BarStacked' }), 'BarStacked')
  assert.equal(chartTypeName('Pie'), 'Pie')
  assert.equal(chartTypeName(undefined), 'Column')
})

test('niceScale gives round gridlines that cover the maximum', () => {
  assert.deepEqual(niceScale(0), { top: 1, step: 0.2 })
  const { top, step } = niceScale(87)
  assert.ok(top >= 87 && step > 0 && top / step <= 10)
})

test('column: one bar per measure and row, a legend for several measures', () => {
  const out = draw('UI.ChartType/Column')
  assert.equal(count(out, /<rect /g), 6)
  assert.match(out, /hf-chart__legend/)
  assert.equal(count(draw('Column', [measures[0]]), /hf-chart__legend/g), 0)
})

test('stacked columns keep one bar per measure and row too, drawn on top of each other', () => {
  const out = draw('ColumnStacked')
  assert.equal(count(out, /<rect /g), 6)
  const xs = [...out.matchAll(/<rect x="([\d.]+)"/g)].map(m => m[1])
  assert.equal(xs[0], xs[1], 'the two measures of a row share their x')
})

test('bar charts run horizontally: the bar length is its width', () => {
  const out = draw('Bar', [measures[0]])
  const widths = [...out.matchAll(/<rect [^>]*width="([\d.]+)"/g)].map(m => Number(m[1]))
  assert.ok(widths[1] > widths[0] && widths[2] === 0)
})

test('line and area: a polyline per measure and a point per value; the area is filled', () => {
  const line = draw('Line')
  assert.equal(count(line, /<polyline /g), 2)
  assert.equal(count(line, /<circle /g), 6)
  assert.equal(count(line, /<polygon /g), 0)
  assert.equal(count(draw('Area'), /<polygon /g), 2)
})

test('pie and donut: a slice per non-zero value; the donut has a hole', () => {
  const pie = draw('Pie')
  assert.equal(count(pie, /<path /g), 2, 'the zero value has no slice')
  assert.equal(count(pie, /hf-chart__hole/g), 0)
  assert.equal(count(draw('Donut'), /hf-chart__hole/g), 1)
})

test('a pie of one value is a full circle, not a degenerate arc', () => {
  const out = String(chartSvg({ type: 'Pie', dimensions, measures: [measures[0]] }, [{ name: 'only', a: 5 }]))
  assert.equal(count(out, /<circle /g), 1)
})

test('values and labels are escaped, and an unknown type is drawn as columns', () => {
  const out = String(chartSvg({ type: 'UI.ChartType/Waterfall', dimensions, measures: [measures[0]] }, [{ name: '<b>x</b>', a: 1 }]))
  assert.ok(!out.includes('<b>'))
  assert.equal(count(out, /<rect /g), 1)
})

test('no rows or no measures: an empty chart message, not an empty SVG', () => {
  assert.match(String(chartSvg({ type: 'Column', dimensions, measures }, [])), /hf-chart--empty/)
  assert.match(String(chartSvg({ type: 'Column', dimensions, measures: [] }, rows)), /hf-chart--empty/)
})
