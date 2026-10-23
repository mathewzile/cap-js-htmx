// Edm.DateTimeOffset filters: SingleRange / SingleValue is a date-time picker (admin Books.createdAt, from manage-authors-htmx).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const { filterField } = require('../../lib/render/filter-bar')
const { parseFilters } = require('../../lib/data/filters')

const HX = { 'HX-Request': 'true' }
const total = async query => Number(/id="lr-count">([\d,]+)</.exec(String((await api.GET(`/htmx/admin/Books${query}`, { headers: HX })).data))[1].replace(/,/g, ''))
const field = (filterExpression, extra = {}) => ({ path: 'createdAt', label: 'Created', cqlPath: 'createdAt', edmType: 'Edm.DateTimeOffset', filterExpression, ...extra })

describe('date-time filters', () => {
  test('SingleRange is one control with two date-time inputs; the instant of the URL is in data-hf-utc, not in value', () => {
    const html = filterField(field('SingleRange'), { 'f.createdAt.ge': '2026-10-23T08:30:00.000Z' }).value
    assert.match(html, /data-hf-picker="range"/)
    assert.equal((html.match(/type="datetime-local"/g) || []).length, 2)
    assert.match(html, /name="f\.createdAt\.ge" type="datetime-local" class="hf-date-range__input" data-hf-utc="2026-10-23T08:30:00\.000Z"/)
    assert.match(html, /name="f\.createdAt\.le" type="datetime-local" class="hf-date-range__input" data-hf-utc=""/)
    assert.doesNotMatch(html, / value=/)
  })

  test('SingleValue is one date-time input', () => {
    const html = filterField(field('SingleValue'), { 'f.createdAt': '2026-10-23T08:30:00.000Z' }).value
    assert.match(html, /name="f\.createdAt" type="datetime-local"[^>]*data-hf-utc="2026-10-23T08:30:00\.000Z" data-hf-picker="value"/)
  })

  test('without the restriction a date-time field stays a text field with conditions; a plain date is still a date picker', () => {
    assert.match(filterField(field(undefined), {}).value, /type="text"/)
    assert.match(filterField({ ...field('SingleRange'), edmType: 'Edm.Date' }, {}).value, /type="date"/)
  })

  test('instants reach the query as UTC, whatever ISO form came in', () => {
    const layout = { filterBar: { fields: [field('SingleRange')] } }
    const where = query => parseFilters(query, layout).filter(t => t?.val !== undefined).map(t => t.val)
    assert.deepEqual(where({ 'f.createdAt.ge': '2026-10-23T08:30:00.000Z' }), ['2026-10-23T08:30:00.000Z'])
    assert.deepEqual(where({ 'f.createdAt.ge': '2026-10-23T10:30:00+02:00' }), ['2026-10-23T08:30:00.000Z'])
    assert.deepEqual(where({ 'f.createdAt.le': '2026-10-23T08:30' }), ['2026-10-23T08:30:00.000Z'], 'no zone is UTC')
    assert.deepEqual(where({ 'f.createdAt.ge': 'nonsense' }), ['nonsense'])
  })

  test('the List Report filters by the range', async () => {
    const all = await total('')
    assert.ok(all > 0)
    assert.equal(await total('?f.createdAt.ge=2000-01-01T00:00:00.000Z'), all)
    assert.equal(await total('?f.createdAt.ge=2000-01-01T00:00:00.000Z&f.createdAt.le=2100-01-01T00:00:00.000Z'), all)
    assert.equal(await total('?f.createdAt.le=2000-01-01T00:00:00.000Z'), 0)
    assert.equal(await total('?f.createdAt.ge=2100-01-01T00:00:00.000Z'), 0)
  })

  test('the page puts the filter in the filter bar', async () => {
    const page = String((await api.GET('/htmx/admin/Books', { headers: HX })).data)
    assert.match(page, /data-hf-filter="createdAt"[\s\S]*?data-hf-picker="range"/)
  })
})
