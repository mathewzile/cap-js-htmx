// How many statements a page costs: the HANA round trips are most of the time of a request, so a total that the rows already
// tell is not counted again, a refresh reads only what it re-renders, and the answer says what the database was asked (Server-Timing).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const cache = require('../../lib/model/cache')
const { loadObjectPage } = require('../../lib/data/page')
const { partsNeeds } = require('../../lib/render/object-page')

const HX = { 'HX-Request': 'true' }
const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const ADMIN = '/admin/'
const opts = { appRoot: root }
const FEW = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0003' // two awards, a few books
const MANY = '9d703c23-7cf7-4cad-9f2b-0e1e1a8c0002' // more than a page of books

/** Loads the Object Page of an author and answers what it returned and the statements it sent. */
async function load(id, extra = {}) {
  const sent = []
  const page = await cds.services.AdminService.tx(async tx => {
    const run = tx.run
    tx.run = function (query, ...rest) { sent.push(query); return run.call(this, query, ...rest) }
    return loadObjectPage(tx, { service: 'AdminService', servicePath: ADMIN, entityType: 'AdminService.Authors', keys: { ID: id, IsActiveEntity: true }, contextPath: '/Authors', ...opts, ...extra })
  })
  const counts = sent.filter(q => JSON.stringify(q).includes('"func":"count"'))
  return { page, sent, counts }
}

describe('statements per request', () => {
  test('a section that fits on one page is not counted: its rows are the total', async () => {
    const { page, counts } = await load(FEW)
    const awards = page.children.Awards ?? Object.values(page.children).find(c => c.rows.some(r => r.name))
    assert.ok(awards.rows.length > 0)
    assert.equal(awards.count, awards.rows.length)
    assert.equal(awards.hasMore, false)
    assert.equal(counts.length, Object.values(page.children).filter(c => c.hasMore).length)
  })

  test('a section with more than a page is counted', async () => {
    const { page, counts } = await load(MANY)
    const books = Object.values(page.children).find(c => c.hasMore)
    assert.ok(books.count > books.rows.length)
    assert.ok(counts.length >= 1)
  })

  test('a refresh that re-renders no section reads no section', async () => {
    const { page, sent } = await load(FEW, { need: { sections: new Set(), fields: new Set() } })
    const { sent: full } = await load(FEW)
    assert.deepEqual(page.children, {})
    assert.ok(sent.length < full.length, `${sent.length} statements instead of ${full.length}`)
  })

  test('partsNeeds() names the sections and fields a change re-renders', () => {
    const layout = cache.objectPageFor(cds.model, 'AdminService', ADMIN, 'AdminService.Authors', '/Authors', opts)
    assert.equal(partsNeeds(layout, { all: true }), undefined)
    assert.equal(partsNeeds(layout, { properties: ['name'] }).sections.size, 0, 'a plain property touches no section')
    const withAwards = partsNeeds(layout, { entities: ['awards'] })
    assert.equal(withAwards.sections.size, 1)
    assert.ok([...withAwards.sections].every(id => /Award/i.test(id)))
  })

  test('the answer carries Server-Timing with the statements and the time', async () => {
    const res = await api.GET(`/htmx/admin/Authors(ID=${FEW},IsActiveEntity=true)`, { headers: HX })
    assert.match(res.headers['server-timing'], /^db;desc="\d+ stmts";dur=[\d.]+, app;dur=[\d.]+$/)
  })
})
