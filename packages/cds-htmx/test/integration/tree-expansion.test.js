// Tree tables: `initialExpansionLevel` (levels that come open) and the paging of a node's children (a "More" row).
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))
const cache = require('../../lib/model/cache')
const treeLib = require('../../lib/data/tree')

const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const FICTION = '10aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const layoutOf = () => cache.listReportFor(cds.model, 'AdminService', '/admin/', 'AdminService.Genres', '/Genres', { appRoot: root })
const withLevels = n => { const layout = layoutOf(); return { ...layout, table: { ...layout.table, hierarchy: { ...layout.table.hierarchy, initialExpansionLevel: n } } } }
const topRows = (layout, limit = 20) => cds.services.AdminService.tx(tx => treeLib.topLevel(tx, cds.model, 'AdminService.Genres', layout, { limit }))

describe('tree table: initial expansion', () => {
  test('level 0 (the default) shows only the top level, collapsed', async () => {
    const { rows } = await topRows(withLevels(0))
    assert.ok(rows.every(r => r._level === 0))
    assert.ok(rows.some(r => r._state === 'collapsed'))
  })

  test('level 1 opens the top nodes: their children follow them, loaded', async () => {
    const { rows } = await topRows(withLevels(1))
    const fiction = rows.findIndex(r => r.ID === FICTION)
    assert.equal(rows[fiction]._state, 'expanded')
    assert.equal(rows[fiction]._loaded, true)
    assert.ok(rows[fiction + 1]._level === 1, 'a child of Fiction comes right after it')
    assert.ok(rows.some(r => r._level === 1))
    assert.ok(rows.filter(r => r._level === 1).every(r => r._state !== 'expanded'), 'one level only')
  })

  test('level 2 goes one deeper', async () => {
    const { rows } = await topRows(withLevels(2))
    assert.ok(rows.some(r => r._level === 2))
  })

  test('the manifest value reaches the hierarchy', () => {
    assert.equal(layoutOf().table.hierarchy.initialExpansionLevel, 0)
    const { buildHierarchy } = require('../../lib/model/hierarchy')
    const store = cache.storeFor(cds.model, 'AdminService', '/admin/', { appRoot: root })
    assert.equal(buildHierarchy(store, 'AdminService.Genres', 'GenresHierarchy', 2).initialExpansionLevel, 2)
    assert.equal(buildHierarchy(store, 'AdminService.Genres', 'GenresHierarchy', 'x').initialExpansionLevel, 0)
  })
})

describe('tree table: children are paged', () => {
  const HX = { 'HX-Request': 'true' }
  const page = async (skip, size) => {
    const before = cds.env.htmx
    cds.env.htmx = { ...before, treeChildrenPage: size }
    try { return String((await api.GET(`/htmx/admin/Genres/$children?node=${FICTION}&level=1&hq=GenresHierarchy&$skip=${skip}`, { headers: HX })).data) } finally { cds.env.htmx = before }
  }
  const idsOf = html => [...html.matchAll(/<tr id="lr-row--([^"]+)"/g)].map(m => m[1])

  test('a page of children ends in a row that loads the next one', async () => {
    const first = await page(0, 2)
    assert.equal(idsOf(first).length, 2)
    const more = /<tr class="fd-table__row hf-tree-more" data-hf-level="1"[^>]*>[\s\S]*?hx-get="([^"]+)" hx-target="closest tr" hx-swap="outerHTML"/.exec(first)
    assert.ok(more, 'the More row')
    assert.match(more[1].replace(/&amp;/g, '&'), /(\$|%24)skip=2/)
    assert.match(more[1], /node=10aaaaaa/)
  })

  test('following the More rows reads every child once, the last page has no More row', async () => {
    const seen = []
    let skip = 0
    for (let i = 0; i < 20; i++) {
      const html = await page(skip, 3)
      seen.push(...idsOf(html))
      if (!html.includes('hf-tree-more')) break
      skip += 3
    }
    assert.ok(seen.length > 3)
    assert.equal(new Set(seen).size, seen.length, 'no child twice')
    const all = idsOf(await page(0, 1000))
    assert.deepEqual(seen, all)
  })
})
