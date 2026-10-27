const cds = require('@sap/cds')
const { html } = require('../render/html')
const cache = require('../model/cache')
const i18n = require('../i18n')
const { config } = require('../config')
const { keyElements, entityDef } = require('../annotations/edm')
const filtersLib = require('../data/filters')
const queryLib = require('../data/query')
const valueListLib = require('../data/value-list')
const toastRender = require('../render/toast')
const listReportRender = require('../render/list-report')
const { cellText } = require('../render/table')
const ids = require('../render/ids')
const treeLib = require('../data/tree')
const { buildHierarchy } = require('../model/hierarchy')
const csvLib = require('../data/csv')
const { EXPORT_LIMIT, orderByFromTerms } = require('./support')

/** List Report routes: the page, its table rows, the tree and the CSV export.
 *  Mixed into `HtmxAdapter` (`Object.assign(HtmxAdapter.prototype, ...)`), so `this` is the adapter. */
module.exports = {
  /** List Report (§routes: `GET /:Set`): the full page/fragment -- filter bar, toolbar, table,
   *  first page of rows plus the total count. */
  async listReport(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const entityType = entity.name
    const base = this.basePath(req)
    const opts = this.appOpts(req)
    const servicePath = this.odataServicePath()

    const lrLayout = cache.listReportFor(cds.model, this.service.name, servicePath, entityType, `/${req.params.Set}`, opts)
    const fcl = this.fclPage(req, req.params.Set, 0)
    if (fcl) ids.setColumn(0)
    this.trackView(req, { entityType, list: true, set: req.params.Set })
    const bundle = cache.bundleFor(opts)
    const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name)

    const parsedFilters = filtersLib.parseFilters(req.query, lrLayout)
    const search = filtersLib.parseSearch(req.query)
    const threshold = lrLayout.table.growingThreshold
    const columns = queryLib.selectColumns(cds.model, entityType, lrLayout)
    const orderByTerms = queryLib.parseOrderBy(req.query, columns)
    const { rows: pageRows, hasMore, count } = await this.listRows(tx, entityType, lrLayout, { filters: parsedFilters, search, query: req.query, limit: threshold })
    const orderBy = orderByFromTerms(orderByTerms)

    const filterOptions = {}
    for (const field of lrLayout.filterBar.fields) {
      if (field.fixedValues && field.valueList) filterOptions[field.path] = await valueListLib.fixedValueOptions(tx, field.valueList)
    }

    const body = listReportRender.listReportFragment(lrLayout, pageRows, {
      basePath: base, entitySetPath: req.params.Set, keyNames, count,
      hasMore, skip: threshold, orderBy, query: req.query, bundle, t: i18n.t, filterOptions, locale: cds.context.locale
    })
    const toasted = req.successMessage
      ? html`<hx-partial hx-target="#toast" hx-swap="outerHTML">${toastRender.toast(req.successMessage)}</hx-partial>${body}`
      : body
    this.render(req, res, { title: lrLayout.header.typeNamePlural || req.params.Set, body: toasted, fcl })
  },

  /** `GET /:Set/$export`: the List Report's rows as a CSV file, for the filters, search and sort in the query
   *  string (the page passes its own URL state) and the columns named by `cols` (their positions in the
   *  table; all when absent), like FE's export of the table. Values are the displayed texts. */
  async exportCsv(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode === 'node') return this.reject(req, res, 405, 'NotAllowed')
    const opts = this.appOpts(req)
    const lrLayout = cache.listReportFor(cds.model, this.service.name, this.odataServicePath(), entity.name, `/${req.params.Set}`, opts)
    const filters = filtersLib.parseFilters(req.query, lrLayout)
    const search = filtersLib.parseSearch(req.query)
    const rows = await csvLib.readAll(async (skip, limit) => {
      const batch = await tx.run(queryLib.listReportQuery(cds.model, entity.name, entity.name, lrLayout, { filters, search, query: req.query, skip, limit }))
      return { rows: batch.slice(0, limit), hasMore: batch.length > limit }
    }, EXPORT_LIMIT)
    const withExtras = typeof req.query.cols === 'string' // the page names the columns it shows, which may include properties added in View Settings; without that, the table's own columns
    const columns = this.csvColumns(req, withExtras ? [...lrLayout.table.columns, ...(lrLayout.table.extraColumns ?? [])] : lrLayout.table.columns)
    const resolve = text => i18n.resolveText(text, cache.bundleFor(opts))
    res.set(csvLib.csvHeaders(req.params.Set, resolve(lrLayout.header.typeNamePlural || req.params.Set)))
    res.send(csvLib.toCsv(columns.map(({ col }) => resolve(col.label ?? col.field?.label ?? '')), rows.map(row => columns.map(({ col }) => cellText(col, row)))))
  },

  /** Table body partial (§routes: `GET /:Set/$table`): sort (header click), search/filter ("Go"),
   *  and growing ("More") all land here and get just the `<tr>` rows (+ an `<hx-partial>` count
   *  refresh) back -- never a full page, since this is only ever reached via `hx-get`. */
  async tablePartial(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    // Reached without htmx (reload/history restore of such a URL): show the List Report with the same filters instead of bare rows
    if (req.headers['sec-fetch-dest'] === 'document' || req.headers['hx-history-restore-request']) {
      const { $skip: _skip, ...query } = req.query
      return res.redirect(302, `${this.basePath(req)}/${req.params.Set}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`)
    }
    const entityType = entity.name
    const base = this.basePath(req)
    const opts = this.appOpts(req)
    const servicePath = this.odataServicePath()

    const lrLayout = cache.listReportFor(cds.model, this.service.name, servicePath, entityType, `/${req.params.Set}`, opts)
    const bundle = cache.bundleFor(opts)
    const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name)

    const parsedFilters = filtersLib.parseFilters(req.query, lrLayout)
    const search = filtersLib.parseSearch(req.query)
    const threshold = lrLayout.table.growingThreshold
    const skip = Number(req.query.$skip) || 0
    const columns = queryLib.selectColumns(cds.model, entityType, lrLayout)
    const orderByTerms = queryLib.parseOrderBy(req.query, columns)
    const { rows: pageRows, hasMore, count } = await this.listRows(tx, entityType, lrLayout, { filters: parsedFilters, search, query: req.query, skip, limit: threshold })
    const orderBy = orderByFromTerms(orderByTerms)
    // a tree pages over its top-level nodes: that is what the growing trigger counts
    const loaded = lrLayout.table.hierarchy ? skip + pageRows.filter(r => r._level === 0).length : skip + pageRows.length

    const body = listReportRender.tablePartial(lrLayout, pageRows, {
      basePath: base, entitySetPath: req.params.Set, keyNames, orderBy,
      skip: skip + threshold, loaded, hasMore, count, query: req.query, bundle, t: i18n.t, locale: cds.context.locale
    })
    // Go/sort keep the filter state in the (replaced, not pushed) URL, so Back from an object lands on the same list;
    // a refresh the page script makes for a List Report in a column (`X-Hf-Quiet`) leaves the URL of the page that is open alone
    if (!req.query.$skip && req.headers['x-hf-quiet'] !== '1') {
      const params = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => v !== '' && !(k === 'f.EditingStatus' && v === 'ALL')))
      res.set('HX-Replace-Url', `${base}/${req.params.Set}${params.size ? '?' + params : ''}`)
      // the header (outside the swapped rows) shows which column the rows are sorted by
      this.trigger(res, JSON.stringify({ 'hf:sorted': { path: orderBy?.path ?? '', desc: !!orderBy?.desc } }))
    }
    res.set('Content-Type', 'text/html').send(String(body))
  },

  /** One page of the List Report's rows, with the total: a flat table's (`$skip` + `limit`), or a tree table's top-level
   *  nodes (with their expanded descendants when a filter or search is active, `data/tree.js`). */
  async listRows(tx, entityType, lrLayout, { filters, search, query, skip = 0, limit }) {
    if (lrLayout.table.hierarchy) {
      return filters.length || search
        ? treeLib.matching(tx, cds.model, entityType, lrLayout, { filters, search, query, skip, limit })
        : treeLib.topLevel(tx, cds.model, entityType, lrLayout, { query, skip, limit })
    }
    const [rows, counted] = await Promise.all([
      tx.run(queryLib.listReportQuery(cds.model, entityType, entityType, lrLayout, { filters, search, query, skip, limit })),
      tx.run(queryLib.listReportCountQuery(entityType, { filters, search }))
    ])
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    await queryLib.markDraftOwners(tx, entityType, lrLayout, pageRows, cds.context.user.id)
    return { rows: pageRows, hasMore, count: queryLib.countOf(counted) }
  },

  /** `GET /:Set/$children?node=<id>&level=<n>&hq=<qualifier>` (tree tables): the rows to insert below an expanded node.
   *  The hierarchy is the one the List Report's manifest names or, for a tree in an Object Page section (whose entity
   *  has no List Report of its own here), the `hq` qualifier -- which must be declared on the entity type. */
  async treeChildren(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    const node = req.query.node
    if (!entity || typeof node !== 'string' || !node) return res.sendStatus(404)
    const entityType = entity.name
    const opts = this.appOpts(req)
    const servicePath = this.odataServicePath()
    const lrLayout = cache.listReportFor(cds.model, this.service.name, servicePath, entityType, `/${req.params.Set}`, opts)
    const hierarchy = lrLayout.table.hierarchy ?? buildHierarchy(cache.storeFor(cds.model, this.service.name, servicePath, opts), entityType, req.query.hq)
    if (!treeLib.isUsable(cds.model, entityType, hierarchy)) return res.sendStatus(404)
    const layout = { ...lrLayout, table: { ...lrLayout.table, hierarchy } }
    const level = Math.min(Math.max(Number(req.query.level) || 1, 1), 100)
    const skip = Math.max(Number(req.query.$skip) || 0, 0)
    const { rows, hasMore } = await treeLib.childrenOf(tx, cds.model, entityType, layout, { node, level, query: req.query, skip, limit: config().treeChildrenPage })
    const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name)
    const bundle = cache.bundleFor(opts)
    const ctx = { basePath: this.basePath(req), entitySetPath: req.params.Set, keyNames, bundle, t: i18n.t }
    // a node with more children than a page: the last row loads the next page (replacing itself)
    const next = new URLSearchParams({ ...req.query, node, level: String(level), $skip: String(skip + rows.length) })
    const more = hasMore ? listReportRender.moreChildrenRow(layout, { level, href: `${ctx.basePath}/${req.params.Set}/$children?${next}`, ...ctx }) : html``
    res.set('Content-Type', 'text/html').send(String(html`${listReportRender.rowsOnly(layout, rows, ctx)}${more}`))
  }
}
