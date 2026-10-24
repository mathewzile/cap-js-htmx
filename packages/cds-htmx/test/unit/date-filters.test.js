const assert = require('node:assert/strict')
const { test } = require('node:test')

const { dateRange } = require('../../lib/data/date-operators')
const { parseFilters } = require('../../lib/data/filters')

// Wednesday 2026-10-21
const NOW = Date.UTC(2026, 9, 21, 15, 30)

test('dateRange() turns the date operators into inclusive day ranges', () => {
  assert.deepEqual(dateRange('Today', NOW), ['2026-10-21', '2026-10-21'])
  assert.deepEqual(dateRange('yesterday', NOW), ['2026-10-20', '2026-10-20'])
  assert.deepEqual(dateRange('Tomorrow', NOW), ['2026-10-22', '2026-10-22'])
  assert.deepEqual(dateRange('This week', NOW), ['2026-10-19', '2026-10-25'], 'weeks start on Monday')
  assert.deepEqual(dateRange('this month', NOW), ['2026-10-01', '2026-10-31'])
  assert.deepEqual(dateRange('This year', NOW), ['2026-01-01', '2026-12-31'])
  assert.deepEqual(dateRange('Last 7 days', NOW), ['2026-10-14', '2026-10-21'])
  assert.deepEqual(dateRange('next  3 days', NOW), ['2026-10-21', '2026-10-24'])
  assert.equal(dateRange('1818-07-30', NOW), undefined)
  assert.equal(dateRange('Today!', NOW), undefined)
})

const R = path => ({ ref: path.split('.') })
const V = val => ({ val })
const date = { path: 'dateOfBirth', cqlPath: 'dateOfBirth', edmType: 'Edm.Date' }
const layout = { filterBar: { fields: [date] } }

test('a date range picker sends a from and a to day (f.<path>.ge / .le)', () => {
  assert.deepEqual(
    parseFilters({ 'f.dateOfBirth.ge': '1810-01-01', 'f.dateOfBirth.le': '1820-12-31' }, layout),
    [R('dateOfBirth'), '>=', V('1810-01-01'), 'and', R('dateOfBirth'), '<=', V('1820-12-31')]
  )
  assert.deepEqual(parseFilters({ 'f.dateOfBirth.ge': '1900-01-01' }, layout), [R('dateOfBirth'), '>=', V('1900-01-01')])
})

test('a single date value is an equality on the day', () => {
  assert.deepEqual(parseFilters({ 'f.dateOfBirth': '1809-01-19' }, layout), [R('dateOfBirth'), '=', V('1809-01-19')])
})

test('only a date field understands the date operators', () => {
  const [clause] = parseFilters({ 'f.dateOfBirth': 'Today' }, layout)
  assert.equal(clause.xpr[1], '>=', 'a range on the day')
  const text = { path: 'name', cqlPath: 'name' }
  assert.deepEqual(parseFilters({ 'f.name': 'Today' }, { filterBar: { fields: [text] } }), [R('name'), '=', V('Today')])
})

test('date comparisons and betweens stay what they are for other fields', () => {
  assert.deepEqual(parseFilters({ 'f.dateOfBirth': '>1900-01-01' }, layout), [R('dateOfBirth'), '>', V('1900-01-01')])
  const [between] = parseFilters({ 'f.dateOfBirth': '1810-01-01...1820-12-31' }, layout)
  assert.deepEqual(between.xpr, [R('dateOfBirth'), '>=', V('1810-01-01'), 'and', R('dateOfBirth'), '<=', V('1820-12-31')])
})

test('dateRange() knows the weeks, months, quarters and years of FE\'s date list', () => {
  assert.deepEqual(dateRange('Last week', NOW), ['2026-10-12', '2026-10-18'])
  assert.deepEqual(dateRange('Next week', NOW), ['2026-10-26', '2026-11-01'])
  assert.deepEqual(dateRange('Last month', NOW), ['2026-09-01', '2026-09-30'])
  assert.deepEqual(dateRange('Next month', NOW), ['2026-11-01', '2026-11-30'])
  assert.deepEqual(dateRange('This quarter', NOW), ['2026-10-01', '2026-12-31'])
  assert.deepEqual(dateRange('Last quarter', NOW), ['2026-07-01', '2026-09-30'])
  assert.deepEqual(dateRange('Next quarter', NOW), ['2027-01-01', '2027-03-31'])
  assert.deepEqual(dateRange('Second quarter', NOW), ['2026-04-01', '2026-06-30'])
  assert.deepEqual(dateRange('Last year', NOW), ['2025-01-01', '2025-12-31'])
  assert.deepEqual(dateRange('Next year', NOW), ['2027-01-01', '2027-12-31'])
  assert.deepEqual(dateRange('Year to Date', NOW), ['2026-01-01', '2026-10-21'])
  assert.deepEqual(dateRange('Date to Year', NOW), ['2026-10-21', '2026-12-31'])
  assert.deepEqual(dateRange('Month 2026-02', NOW), ['2026-02-01', '2026-02-28'])
  assert.deepEqual(dateRange('Today -2/+5 days', NOW), ['2026-10-19', '2026-10-26'])
})

test('dateRange() counts whole weeks, months, quarters and years for Last / Next X', () => {
  assert.deepEqual(dateRange('Last 2 weeks', NOW), ['2026-10-05', '2026-10-18'])
  assert.deepEqual(dateRange('Next 2 weeks', NOW), ['2026-10-26', '2026-11-08'])
  assert.deepEqual(dateRange('Last 3 months', NOW), ['2026-07-01', '2026-09-30'])
  assert.deepEqual(dateRange('Next 1 years', NOW), ['2027-01-01', '2027-12-31'])
})

test('"Not Specified" filters the dates that are empty', () => {
  assert.deepEqual(parseFilters({ 'f.dateOfBirth': 'Not Specified' }, layout), [R('dateOfBirth'), 'is', 'null'])
})
