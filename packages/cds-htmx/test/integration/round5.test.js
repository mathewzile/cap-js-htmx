const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const cache = require('../../lib/model/cache')
const i18n = require('../../lib/i18n')
const { loadObjectPage } = require('../../lib/data/page')
const objectPageRender = require('../../lib/render/object-page')
const { buildHierarchy } = require('../../lib/model/hierarchy')

const HX = { 'HX-Request': 'true' }
const root = path.join(__dirname, '..', '..', '..', '..', 'app')
const ADMIN = '/admin/'
const storeOf = () => cache.storeFor(cds.model, 'AdminService', ADMIN, { appRoot: root })
const layoutOf = (set, entity = set) => cache.listReportFor(cds.model, 'AdminService', ADMIN, `AdminService.${entity}`, `/${set}`, { appRoot: root })

const get = async url => (await api.GET(url, { headers: HX })).data
const rowsOf = html => [...html.matchAll(/<tr id="lr-row--[^>]*data-hf-level="(\d+)" data-hf-state="(\w+)" data-hf-node="([^"]+)"/g)].map(m => ({ level: Number(m[1]), state: m[2], node: m[3] }))
const FICTION = '10aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const FANTASY = '13aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('round 5: tree table, paging, date filters', () => {

  describe('model', () => {
    test('the manifest of browse-genres makes the Genres list a tree on the declared hierarchy', () => {
      const lr = layoutOf('Genres')
      assert.equal(lr.table.type, 'TreeTable')
      assert.deepEqual(lr.table.hierarchy, { qualifier: 'GenresHierarchy', nodeProperty: 'ID', parentNavigation: 'parent', parentKey: 'parent_ID', initialExpansionLevel: 0 })
    })

    test('without a usable hierarchy the table stays flat', () => {
      assert.equal(buildHierarchy(storeOf(), 'AdminService.Genres', 'NoSuchQualifier'), undefined)
      assert.equal(buildHierarchy(storeOf(), 'AdminService.Books', undefined), undefined)
      assert.equal(layoutOf('Authors').table.type, 'ResponsiveTable')
    })

    test('Authors.dateOfBirth is a SingleRange date filter (Capabilities.FilterRestrictions)', () => {
      const [dateOfBirth] = layoutOf('Authors').filterBar.fields
      assert.equal(dateOfBirth.path, 'dateOfBirth')
      assert.equal(dateOfBirth.edmType, 'Edm.Date')
      assert.equal(dateOfBirth.filterExpression, 'SingleRange')
    })
  })

  describe('tree table routes', () => {
    test('the list shows the top level, collapsed, without a count, and a tree grid', async () => {
      const html = await get('/htmx/admin/Genres')
      assert.match(html, /role="treegrid"/)
      assert.match(html, /data-hf-tree="[^"]*\/Genres\/\$children\?hq=GenresHierarchy"/)
      assert.deepEqual(rowsOf(html).map(r => [r.level, r.state]), [[0, 'collapsed'], [0, 'collapsed']])
      assert.doesNotMatch(html, /id="lr-count"/)
    })

    test('$children answers the rows below a node, one level deeper, leaves marked', async () => {
      const rows = rowsOf(await get(`/htmx/admin/Genres/$children?node=${FICTION}&level=1&hq=GenresHierarchy`))
      assert.equal(rows.length, 9)
      assert.ok(rows.every(r => r.level === 1))
      assert.equal(rows.find(r => r.node === FANTASY).state, 'collapsed')
      assert.equal(rows.find(r => r.node.startsWith('11aaaaaa')).state, 'leaf')
      const deeper = rowsOf(await get(`/htmx/admin/Genres/$children?node=${FANTASY}&level=2&hq=GenresHierarchy`))
      assert.deepEqual(deeper.map(r => r.level), [2, 2, 2, 2])
    })

    test('a search keeps the matches with the ancestors that lead to them, expanded', async () => {
      const rows = rowsOf(await get('/htmx/admin/Genres/$table?$search=Noir'))
      assert.deepEqual(rows.map(r => r.level), [0, 1, 2, 1, 2, 3, 3])
      assert.ok(rows.filter(r => r.level < 3 && r.state !== 'leaf').every(r => r.state === 'expanded'))
    })

    test('sorting orders the siblings and starts from the top level again', async () => {
      const rows = rowsOf(await get('/htmx/admin/Genres/$table?$skip=0&$orderby=name%20desc'))
      assert.deepEqual(rows.map(r => r.node.slice(0, 3)), ['20a', '10a'])
    })

    test('$children needs a node and a declared hierarchy', async () => {
      assert.equal((await api.GET('/htmx/admin/Genres/$children', { headers: HX, validateStatus: () => true })).status, 404)
      assert.equal((await api.GET(`/htmx/admin/Authors/$children?node=${FICTION}&hq=Nope`, { headers: HX, validateStatus: () => true })).status, 404)
    })

    test('the Create toolbar stays out of the way of a Genres title that has no HeaderInfo', async () => {
      assert.match(await get('/htmx/admin/Genres'), /hf-table-toolbar__title">Genres</)
    })
  })

  describe('tree table in an Object Page section', () => {
    // an app whose Genres page lists the sub-genres (`children`) as a tree table, declared the way FE's manifest does
    const treeRoot = path.join(__dirname, '..', 'fixtures', 'tree-app')
    // the layout caches are keyed by locale, not by app folder: a locale of its own keeps this app apart from the real ones
    const opts = { appRoot: treeRoot, locale: 'de' }

    test('the section table is a tree on the hierarchy the manifest names', () => {
      const layout = cache.objectPageFor(cds.model, 'AdminService', ADMIN, 'AdminService.Genres', '/Genres', opts)
      const section = layout.sections.find(f => f.id === 'SubGenres')
      assert.equal(section.content.kind, 'table')
      assert.equal(section.content.nav, 'children')
      assert.equal(section.content.hierarchy.qualifier, 'GenresHierarchy')
    })

    test('it lists the children of the object collapsed, and expands them through $children', async () => {
      const layout = cache.objectPageFor(cds.model, 'AdminService', ADMIN, 'AdminService.Genres', '/Genres', opts)
      const page = await cds.services.AdminService.tx(tx => loadObjectPage(tx, {
        service: 'AdminService', servicePath: ADMIN, entityType: 'AdminService.Genres', keys: { ID: FICTION }, contextPath: '/Genres', ...opts
      }))
      const child = page.children.SubGenres
      assert.equal(child.tree.set, 'Genres')
      assert.equal(child.rows.length, 9)
      assert.ok(child.rows.every(r => r._level === 0))
      assert.equal(child.rows.find(r => r.ID === FANTASY)._state, 'collapsed')

      const html = String(objectPageRender.objectPageFragment(layout, page.row, {
        basePath: '/htmx/admin', entitySetPath: `Genres(ID=${FICTION})`, trail: [], children: page.children, bundle: page.bundle, t: i18n.t
      }))
      assert.match(html, /role="treegrid"[^>]*data-hf-tree="\/htmx\/admin\/Genres\/\$children\?hq=GenresHierarchy"/)
      assert.equal((html.match(/data-hf-level="0"/g) || []).length, 9)
      assert.match(html, /hf-tree-toggle/)
      assert.doesNotMatch(html, /Sub-Genres \(\d+\)/, 'no count on a tree')
    })

    test('without the manifest setting the section is no tree', async () => {
      const layout = cache.objectPageFor(cds.model, 'AdminService', ADMIN, 'AdminService.Genres', '/Genres', { appRoot: root, locale: 'fr' })
      assert.equal(layout.sections.some(f => f.content?.hierarchy), false)
    })
  })

  describe('paging through the 1005 books', () => {
    test('the first page, the total and the trigger: [ 20 / 1,005 ]', async () => {
      const html = await get('/htmx/catalog/Books')
      assert.match(html, /Books \(<span id="lr-count">1,005<\/span>\)/)
      assert.match(html, /hf-table__growing-info">\[ 20 \/ 1,005 \]</)
      assert.equal((html.match(/<tr id="lr-row--/g) || []).length, 20)
    })

    test('"More" asks for the rows after those shown and the response moves the trigger on', async () => {
      const html = await get('/htmx/catalog/Books/$table?$skip=20')
      assert.equal((html.match(/<tr id="lr-row--/g) || []).length, 20)
      assert.match(html, /hf-table__growing-info">\[ 40 \/ 1,005 \]</)
      assert.match(html, /(%24|\$)skip=40/)
    })

    test('the last page has the rest and no trigger', async () => {
      const html = await get('/htmx/catalog/Books/$table?$skip=1000')
      assert.equal((html.match(/<tr id="lr-row--/g) || []).length, 5)
      assert.match(html, /<div id="lr-growing" class="hf-table__growing"><\/div>/)
    })

    test('paging over a sort column with ties shows every book exactly once', async () => {
      const seen = new Set()
      for (let skip = 0; skip < 1005; skip += 20) {
        const html = await get(`/htmx/catalog/Books/$table?$orderby=stock&$skip=${skip}`)
        for (const m of html.matchAll(/<tr id="lr-row--([^"]+)"/g)) seen.add(m[1])
      }
      assert.equal(seen.size, 1005)
    })

    test('a sort tells the header which column it is sorted by (HX-Trigger hf:sorted)', async () => {
      const res = await api.GET('/htmx/catalog/Books/$table?$orderby=stock%20desc', { headers: HX })
      assert.deepEqual(JSON.parse(res.headers['hx-trigger']), { 'hf:sorted': { path: 'stock', desc: true } })
      assert.equal((await api.GET('/htmx/catalog/Books/$table?$skip=20', { headers: HX })).headers['hx-trigger'], undefined)
    })
  })

  describe('date filters', () => {
    test('a SingleRange date field renders one range picker', async () => {
      const html = await get('/htmx/admin/Authors')
      assert.match(html, /class="fd-input hf-date-range"/)
      assert.match(html, /name="f\.dateOfBirth\.ge" type="date"/)
      assert.match(html, /name="f\.dateOfBirth\.le" type="date"/)
    })

    test('the picker value is kept in the inputs and filters the rows', async () => {
      const html = await get('/htmx/admin/Authors?f.dateOfBirth.ge=1810-01-01&f.dateOfBirth.le=1820-12-31')
      assert.match(html, /name="f\.dateOfBirth\.ge" type="date" class="hf-date-range__input" value="1810-01-01"/)
      assert.match(html, /Authors \(<span id="lr-count">2<\/span>\)/)
    })

    test('a date field can be filtered with a date operator typed into the field', async () => {
      const html = await get('/htmx/admin/Authors/$table?f.dateOfBirth=Today')
      assert.match(html, /hx-target="#lr-count"[^>]*>0</)
    })
  })
})
