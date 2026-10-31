const cds = require('@sap/cds')
const { tableFacets } = require('../data/page')
const { sectionPage } = require('../data/section')
const { html, raw: rawHtml } = require('../render/html')
const cache = require('../model/cache')
const i18n = require('../i18n')
const { keyElements, entityDef, resolveElement } = require('../annotations/edm')
const { evaluate } = require('../annotations/expressions')
const keysLib = require('../keys')
const draftMessages = require('../data/draft-messages')
const { cellText } = require('../render/table')
const { formatCount } = require('../data/format')
const objectPageRender = require('../render/object-page')
const ids = require('../render/ids')
const { loadObjectPage } = require('../data/page')
const csvLib = require('../data/csv')
const { EXPORT_LIMIT } = require('./support')
const { canEdit, capabilityColumns } = require('../model/edit-capabilities')

/** Object Page routes: the page of an object, of a sub-object and of a table section.
 *  Mixed into `HtmxAdapter` (`Object.assign(HtmxAdapter.prototype, ...)`), so `this` is the adapter. */
module.exports = {
  /** `GET /:Set` dispatcher (§routes): Express/path-to-regexp greedily matches an entire keyed
   *  segment here too (`Books(ID='x',IsActiveEntity=true)` -> `req.params.Set` whole string), so a
   *  single top-level route has to branch on whether key values are present rather than being able
   *  to register separate List Report / Object Page routes. */
  async entityRoute(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    if (!set) return res.sendStatus(404)
    if (raw == null) return this.listReport(req, res, tx)
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    return this.objectPage(req, res, tx, { entityType: entity.name, keys, segments: [{ set, raw }], contextPath: `/${set}` })
  },

  /** `GET /*splat` (§routes): nested sub-Object-Page paths (`Books(..)/chapters(..)`). Registered
   *  last, so it only ever sees requests `/:Set` and `/:Set/$table` didn't already claim -- i.e.
   *  genuinely multi-segment paths. Walks the navigation chain structurally via `resolveElement`
   *  (CSN only; the layout itself still comes from the annotation store, §3.2). */
  async subObjectPage(req, res, tx) {
    const full = (req.params.splat || []).join('/')
    if (/\/\$table$/.test(full)) return this.sectionTable(req, res, tx, full.slice(0, -'/$table'.length))
    if (/\/\$export$/.test(full)) return this.sectionTable(req, res, tx, full.slice(0, -'/$export'.length), { csv: true })
    const segments = keysLib.splitSegments(full)
    if (segments.length < 2) return res.sendStatus(404)
    const top = this.entitySet(segments[0].set)
    if (!top || segments[0].raw == null) return res.sendStatus(404)
    let entityType = top.name
    for (let i = 1; i < segments.length; i++) {
      const element = resolveElement(cds.model, entityType, segments[i].set)
      if (!element?.target) return res.sendStatus(404)
      entityType = element.target
    }
    const last = segments[segments.length - 1]
    if (last.raw == null) return res.sendStatus(404)
    const keys = keysLib.parseKeys(last.raw)
    const contextPath = `/${segments[0].set}/${segments.slice(1).map(s => s.set).join('/')}`
    return this.objectPage(req, res, tx, { entityType, keys, segments, contextPath })
  },

  /** `GET <object>/<nav>/$table`: rows of a table section of an Object Page, the way `$table` serves the List Report's: the next
   *  page (`$skip`, appended by the More button), or the first page of a search (`$search`) or a sort (`$orderby`) that replaces the
   *  rows. The section's total and its More button follow as partials. The parent is the object path (any depth) before `<nav>`. */
  async sectionTable(req, res, tx, path, { csv = false } = {}) {
    const segments = keysLib.splitSegments(path)
    if (segments.length < 2 || segments[0].raw == null) return res.sendStatus(404)
    const nav = segments[segments.length - 1]
    const parents = segments.slice(0, -1)
    if (nav.raw != null || parents.some(s => s.raw == null)) return res.sendStatus(404)
    const top = this.entitySet(parents[0].set)
    if (!top) return res.sendStatus(404)
    let parentType = top.name
    for (const seg of parents.slice(1)) {
      const element = resolveElement(cds.model, parentType, seg.set)
      if (!element?.target) return res.sendStatus(404)
      parentType = element.target
    }
    const parentKeys = keysLib.parseKeys(parents[parents.length - 1].raw)
    const contextPath = `/${parents[0].set}${parents.slice(1).map(s => `/${s.set}`).join('')}`
    const opts = this.appOpts(req)
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), parentType, contextPath, opts)
    const facet = tableFacets(layout).find(f => f.content.nav === nav.set)
    if (!facet || facet.content.hierarchy) return res.sendStatus(404)
    const fcl = this.fclPage(req, parents[0].set, parents.length, parents)
    if (fcl) ids.setColumn(fcl.column)

    if (csv) return this.sectionCsv(req, res, tx, { facet, parentType, parentKeys })
    const skip = Math.max(Number(req.query.$skip) || 0, 0)
    const page = await sectionPage(tx, { parentEntityType: parentType, parentKeys, content: facet.content, query: req.query, skip })
    const base = this.basePath(req)
    const entitySetPath = parents.map(s => `${s.set}(${s.raw})`).join('/')
    const bundle = cache.bundleFor(opts)
    const keyNames = keyElements(entityDef(cds.model, facet.content.targetEntityType)).map(k => k.name)
    const sectionId = ids.opSection(facet.id)
    const tableUrl = `${base}/${entitySetPath}/${nav.set}/$table`
    const query = Object.fromEntries(Object.entries(req.query).filter(([k]) => k === '$search' || k === '$orderby'))
    const rows = objectPageRender.sectionRowsHtml(facet, page.rows, keyNames, { basePath: base, entitySetPath, bundle, t: i18n.t, isDraft: parentKeys.IsActiveEntity === false })
    const growing = objectPageRender.sectionGrowing(sectionId, tableUrl, { skip: skip + page.rows.length, hasMore: page.hasMore, count: page.count, bundle, t: i18n.t, query, locale: cds.context.locale })
    res.set('Content-Type', 'text/html').send(String(html`${rows}<hx-partial hx-target="#${sectionId}-count" hx-swap="innerHTML"> (${formatCount(page.count, cds.context.locale)})</hx-partial><hx-partial hx-target="#${sectionId}-growing" hx-swap="outerHTML">${growing}</hx-partial>`))
  },

  /** `GET <object>/<nav>/$export`: the whole table of a section (with its search and sort, the visible columns `cols`) as CSV. */
  async sectionCsv(req, res, tx, { facet, parentType, parentKeys }) {
    const rows = await csvLib.readAll((skip, limit) => sectionPage(tx, { parentEntityType: parentType, parentKeys, content: facet.content, query: req.query, skip, limit }), EXPORT_LIMIT)
    const columns = this.csvColumns(req, facet.content.columns)
    const resolve = text => i18n.resolveText(text, cache.bundleFor(this.appOpts(req)))
    res.set(csvLib.csvHeaders(facet.content.nav, resolve(facet.label ?? facet.content.nav)))
    res.send(csvLib.toCsv(columns.map(({ col }) => resolve(col.label ?? col.field?.label ?? '')), rows.map(row => columns.map(({ col }) => cellText(col, row)))))
  },

  /** The columns of a table that an export covers: the ones with a field, and of those only the positions named by `cols` (all when absent). */
  csvColumns(req, tableColumns) {
    const wanted = typeof req.query.cols === 'string' ? new Set(req.query.cols.split(',').map(Number)) : null
    return tableColumns.map((col, index) => ({ col, index })).filter(({ col, index }) => col.field && (!wanted || wanted.has(index)))
  },

  /** Object Page (§routes: `GET /:Set(keys)[/nav(keys)...]`): the full page/fragment -- header,
   *  header facets, sections (forms/dataPoint/contact/table), derived from the *whole* `OPLayout`
   *  tree, not just the LineItem/SideEffects slice (§3.1: "translate all resulting annotations to
   *  page layout, not just side effects"). `editMode` is passed for non-draft pages being edited or
   *  created (draft pages are recognised by their row); `overrides`/`messages`/`status` re-show a form
   *  that failed validation with the user's input intact. `keys == null` is the create page. */
  async objectPage(req, res, tx, { entityType, keys, segments, contextPath, editMode, overrides, messages, status }) {
    const base = this.basePath(req)
    const { appRoot: root, locale, app } = this.appOpts(req)
    const servicePath = this.odataServicePath()

    const editing = !!editMode || keys?.IsActiveEntity === false
    const page = await loadObjectPage(tx, { service: this.service.name, servicePath, entityType, keys, contextPath, appRoot: root, locale, app, editing })
    if (!page) return this.objectNotFound(req, res, tx, { keys, segments })
    const { layout: opLayout, row, bundle, valueLists, children } = page
    if (overrides) Object.assign(row, overrides)
    const persisted = row.IsActiveEntity === false ? draftMessages.labelled(draftMessages.fromDraftMessages(row.DraftMessages), opLayout) : []
    const entitySetPath = segments.map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
    const fcl = this.fclPage(req, segments[0].set, segments.length, segments)
    if (fcl) ids.setColumn(fcl.column)
    if (keys) this.trackView(req, { entityType, keys, contextPath, entitySetPath })
    const title = keys
      ? evaluate(opLayout.header?.title?.Value, row) ?? opLayout.header?.typeName ?? segments[segments.length - 1].set
      : i18n.t(bundle, 'NewObject').replace('{0}', opLayout.header?.typeName ?? '')
    const trail = [
      { label: i18n.t(bundle, 'Home'), href: '' },
      ...segments.map((seg, i) => i === segments.length - 1
        ? { label: title }
        : { label: seg.set, href: `/${segments.slice(0, i + 1).map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')}` })
    ]

    // A sub-object page (a draft node) has the Edit of its root: it offers it while the root can be edited and has no draft yet
    let rootEdit
    if (opLayout.edit?.mode === 'node' && !editMode && row.IsActiveEntity !== false && segments.length > 1 && segments[0].raw != null) {
      const rootType = this.entitySet(segments[0].set)?.name
      const rootKeys = { ...keysLib.parseKeys(segments[0].raw), IsActiveEntity: true }
      const rootCaps = rootType && this.editOf(req, rootType)
      const rootRow = rootType && await tx.run(SELECT.one.from(rootType).columns([...capabilityColumns(rootCaps, rootType), 'HasDraftEntity']).where(rootKeys))
      if (rootRow) rootEdit = { canEdit: canEdit(rootCaps, rootRow), draftExists: rootRow.HasDraftEntity === true, path: `${base}/${segments[0].set}(${segments[0].raw})` }
    }
    let body = objectPageRender.objectPageFragment(opLayout, row, {
      basePath: base, entitySetPath, trail, children, bundle, t: i18n.t, valueLists, editMode, rootEdit,
      successMessage: req.successMessage, messages: persisted, fcl, locale: cds.context.locale
    })
    if (messages?.length) body = html`${rawHtml(this.messagesPartial(messages))}${body}`
    if (status) res.status(status)
    // the browser tab, as in Fiori elements: "<object title> - <entity set>"
    this.render(req, res, { title: `${title} - ${segments[segments.length - 1].set}`, body, keepMessages: !!messages?.length, fcl })
  },

  /** A page whose object is gone: a draft that was saved or discarded (browser back/forward onto its URL)
   *  shows the saved version, anything else falls back to the List Report. Full-page loads are redirected,
   *  htmx requests are answered with the target page and `HX-Replace-Url`, so history never keeps a dead URL. */
  async objectNotFound(req, res, tx, { keys, segments }) {
    const base = this.basePath(req)
    const set = segments[0].set
    if (keys?.IsActiveEntity === false && segments.length === 1) {
      const activeKeys = { ...keys, IsActiveEntity: true }
      const exists = await tx.run(SELECT.one.from(this.entitySet(set).name).columns('1 as one').where(activeKeys)).catch(() => null)
      if (exists) {
        const url = `${base}/${set}(${keysLib.formatKeys(activeKeys)})`
        if (!this.isFragmentRequest(req)) return res.redirect(302, url)
        res.set('HX-Replace-Url', url)
        return this.objectPage(req, res, tx, { entityType: this.entitySet(set).name, keys: activeKeys, segments: [{ set, raw: keysLib.formatKeys(activeKeys) }], contextPath: `/${set}` })
      }
    }
    res.status(404)
    const body = html`
      <div class="hf-page hf-page--op"><div class="hf-page__content">
        <div class="fd-message-strip fd-message-strip--error" role="alert"><div class="fd-message-strip__content"><div class="fd-message-strip__text">${this.text(req, 'ObjectNotFound')}</div></div></div>
        <p><a class="fd-link" href="${base}/${set}" hx-get="${base}/${set}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">${set}</a></p>
      </div></div>`
    return this.render(req, res, { title: this.text(req, 'ObjectNotFound'), body })
  },

  /** What the table section of an Object Page allows (`model/object-page.js`): the answer the page itself used to offer or hide Create,
   *  Delete and the inputs, so that a request made by hand is refused the same way. `{}` (everything) when the section is unknown. */
  sectionCaps(req, rootType, rootSet, nav) {
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), rootType, `/${rootSet}`, this.appOpts(req))
    return tableFacets(layout).find(f => f.content.nav === nav)?.content.capabilities || {}
  }
}
