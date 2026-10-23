const cds = require('@sap/cds')
const express = require('express')
const HttpAdapter = require('@sap/cds/lib/srv/protocols/http')
const layout = require('./render/layout')
const { html, raw: rawHtml, partial } = require('./render/html')
const channels = require('./sse/channels')
const { open: openSse, write: writeSse } = require('./sse/stream')
const cache = require('./model/cache')
const i18n = require('./i18n')
const { appRoot, config } = require('./config')
const assets = require('./assets')
const crypto = require('node:crypto')
const apps = require('./apps')
const { keyElements, entityDef, resolveElement, backlinkElement } = require('./annotations/edm')
const { evaluate } = require('./annotations/expressions')
const keysLib = require('./keys')
const filtersLib = require('./data/filters')
const queryLib = require('./data/query')
const draftLib = require('./data/draft')
const actionsLib = require('./data/actions')
const valueListLib = require('./data/value-list')
const messageRender = require('./render/messages')
const playgroundRender = require('./render/playground')
const draftMessages = require('./data/draft-messages')
const { textsFor } = require('./render/texts')
const toastRender = require('./render/toast')
const listReportRender = require('./render/list-report')
const { cellText } = require('./render/table')
const { formatCount } = require('./data/format')
const objectPageRender = require('./render/object-page')
const fclRender = require('./render/fcl')
const ids = require('./render/ids')
const valueHelpRender = require('./render/value-help')
const { loadObjectPage } = require('./data/page')
const { InputError } = require('./data/form')
const { editCapabilities, canCreate, canEdit, canDelete } = require('./model/edit-capabilities')
const engine = require('./sse/side-effects-engine')
const treeLib = require('./data/tree')
const { buildHierarchy } = require('./model/hierarchy')

/** `query.js#parseOrderBy()` returns CQL `orderBy` terms (`['stock desc']`); the table header
 *  renderer wants just the first term as `{path, desc}` to know which column's sort icon to show. */
function orderByFromTerms(terms) {
  if (!terms?.length) return undefined
  const [path, dir] = terms[0].split(' ')
  return { path, desc: dir === 'desc' }
}

/** Most rows of one CSV export. */
const csvLib = require('./data/csv')
const EXPORT_LIMIT = 5000

/** `X-Htmx-Base`: absolute path segments only. */
const BASE_PATH = /^\/[\w.\-/~]*$/

class HtmxAdapter extends HttpAdapter {

  get router() {
    const router = super.router
    router.use(express.urlencoded({ extended: true, ...this.body_parser_options }))
    router.use(express.json(this.body_parser_options))
    router.use(this.logRequest.bind(this))
    router.use(this.requireHtmx.bind(this))
    router.use(this.stickySession.bind(this))
    router.use(this.resolveApp.bind(this))

    router.use(this.fclShown.bind(this))
    router.get('/', this.handle(this.home))
    router.get('/$events', this.handle(this.events))
    router.get('/$shell', this.handle(this.shellInfo))
    router.get('/$playground', this.handle(this.playground))
    router.get('/$playground/clients', this.handle(this.playgroundClients))
    router.post('/$playground/watch', this.handle(this.playgroundWatch))
    router.post('/$playground/action/:name', this.handle(this.playgroundAction))
    router.get('/:Set/$export', this.handle(this.exportCsv))
    router.get('/:Set/$table', this.handle(this.tablePartial))
    router.get('/:Set/$children', this.handle(this.treeChildren))
    router.post('/:Set/$delete', this.handle(this.deleteSelected))
    router.post('/:Set/$edit', this.handle(this.editDraft))
    router.post('/:Set/$save', this.handle(this.saveDraft))
    router.post('/:Set/$discard', this.handle(this.discardDraft))
    router.post('/:Set/$effects', this.handle(this.flushEffects))
    router.patch('/:Set/$field/:path', this.handle(this.patchField))
    router.get('/:Set/$vh/:path', this.handle(this.valueHelp))
    router.post('/:Set/$action/:name', this.handle(this.callAction))
    router.post('/:Set/:nav', this.handle(this.createChild))
    router.post('/:Set', this.handle(this.createDraft))
    router.delete('/:Set', this.handle(this.deleteEntity))
    router.get('/:Set', this.handle(this.entityRoute))
    router.get('/*splat', this.handle(this.subObjectPage))
    router.patch('/*splat', this.handle(this.patchNested))
    router.post('/*splat', this.handle(this.postNested))

    return router
  }

  /** Writes (anything but GET/HEAD/OPTIONS) must come from htmx: the `HX-Request` header cannot be set by a form or an
   *  image on another site, so together with the approuter's CSRF token it keeps cross-site requests out
   *  (`requireHxRequestForMutations`). */
  requireHtmx(req, res, next) {
    if (!config().requireHxRequestForMutations || /^(GET|HEAD|OPTIONS)$/.test(req.method) || req.headers['hx-request']) return next()
    res.status(403).type('text/plain').send('Forbidden: write requests need the HX-Request header')
  }

  /** Server-sent-event channels live in the memory of one CAP instance, so a browser has to keep talking to the same
   *  instance. Cloud Foundry's router makes requests sticky when the app sets a `JSESSIONID` cookie. The cookie
   *  holds nothing: it is a random value, set on page loads and on the event stream. */
  stickySession(req, res, next) {
    const { stickySessions } = config()
    const name = stickySessions === true ? 'JSESSIONID' : stickySessions
    const wanted = name && req.method === 'GET' && (req.path === '/$events' || req.path === '/$shell' || !this.isFragmentRequest(req))
    if (wanted && !(req.headers.cookie || '').split(/;\s*/).some(c => c.startsWith(`${name}=`))) {
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
      res.append('Set-Cookie', `${name}=${crypto.randomUUID()}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`)
    }
    next()
  }

  /** `GET /$shell`: what the generic frontend shell (`cds-htmx-shell`) needs to start the app in a page it does not
   *  own (Work Zone, `index.html`): the versioned asset URLs under the shell's own base, the theme CSS per UI5 theme and the UI
   *  texts. Never cached: it is how a shell learns about a new asset version. */
  async shellInfo(req, res) {
    const { styles, scripts, version, root } = assets.urls(req.htmxBase || '')
    const themeCss = ['sap_horizon', 'sap_horizon_dark', 'sap_horizon_hcb', 'sap_horizon_hcw']
    // `auto` (light or dark as the browser prefers) is resolved by the shell; the light theme is what it starts from
    const configured = config().theme
    res.set('Cache-Control', 'no-cache').json({
      version, root, theme: configured === 'auto' ? 'sap_horizon' : configured, auto: configured === 'auto',
      themes: Object.fromEntries(themeCss.map(name => [name, styles.theme(name)])),
      variables: Object.fromEntries(themeCss.map(name => [name, styles.variables(name)])),
      styles: { variables: styles.variables(configured === 'auto' ? 'sap_horizon' : configured), common: styles.common, fundamental: styles.fundamental, own: styles.own },
      scripts,
      texts: textsFor(cache.bundleFor(this.appOpts(req))),
      animations: this.animationsOf(req),
      servicePath: this.basePath(req)
    })
  }

  /** Logs incoming htmx and SSE requests the way CAP logs OData ones (`[htmx] - GET /Books`). */
  logRequest(req, res, next) {
    const sse = req.path === '/$events'
    const detail = sse ? ` { client: '${req.query.client}' }` : Object.keys(req.query).length ? ` ${JSON.stringify(req.query)}` : ''
    cds.log(sse ? 'sse' : 'htmx').info(`${req.method} ${req.path}${detail}`)
    next()
  }

  /** Resolves the OData endpoint path for this (possibly multi-protocol, `@odata @htmx`) service,
   *  since FE manifests and `cds.compile.to.edm()`'s locale-agnostic column shapes are both keyed
   *  to the OData path, not the htmx one (§3.1: "compile once per `@htmx` service ... so paths
   *  match `$metadata` exactly"). Falls back to this adapter's own path if the service isn't also
   *  served over OData. */
  /** App context of a request (design doc §2). `X-Htmx-App: <id>@<version>` selects a pulled frontend
   *  app whose annotation layers and page settings replace the `app/` folder scan; `X-Htmx-Base` is the
   *  URL prefix the frontend is served under (e.g. behind a Work Zone approuter), prepended to every
   *  link and history URL we generate. Both are untrusted and validated here, once. */
  async resolveApp(req, res, next) {
    try {
      const base = req.headers['x-htmx-base']
      if (base != null && base !== '') {
        if (!BASE_PATH.test(base) || base.includes('//') || base.includes('..')) throw new apps.AppError(400, 'Invalid X-Htmx-Base')
        req.htmxBase = base.replace(/\/+$/, '')
      }
      const ref = req.headers['x-htmx-app'] || (req.path === '/$events' ? req.query.app : undefined)
      if (ref) {
        const { app, outdated } = await apps.resolve(String(ref))
        await app.ensureLocale(cds.context?.locale)
        req.htmxApp = app
        // The browser runs an older version than the one served: let the shell offer a reload
        if (outdated) this.trigger(res, JSON.stringify({ 'hf:appUpdated': '' }))
      }
      next()
    } catch (err) {
      next(err)
    }
  }

  /** Prefix for generated URLs: the frontend's own base (if any) plus the service path. */
  basePath(req) {
    return (req.htmxBase || '') + req.baseUrl
  }

  /** Everything the cache/model layer needs to know which layout source a request uses. */
  appOpts(req) {
    return { appRoot: appRoot(), locale: cds.context.locale, app: req.htmxApp }
  }

  odataServicePath() {
    return engine.servicePaths(this.service).odata
  }

  /** Remembers what this browser page is looking at (the `X-Htmx-Client` header every request of a
   *  page carries, §4.1), so side effects and server events know which clients to push to. */
  viewOf(req, view) {
    return { service: this.service.name, servicePath: this.odataServicePath(), basePath: this.basePath(req), app: req.htmxApp, ...view }
  }

  trackView(req, view) {
    // A full page load has no client id yet (it is created for the response): remember the view for it
    // (it also remembers the Flexible Column Layout column the page is in: a push to it later renders with that column's ids)
    const tracked = this.viewOf(req, { ...view, column: ids.column() })
    req.hfView = tracked
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    // The stream may not be open yet (pages that want one open it after the swap): it picks the view up then
    if (channels.forUser(clientId)) channels.setView(clientId, tracked)
    else channels.rememberView(clientId, tracked)
  }

  entitySet(name) {
    return this.service.entities[name]
  }

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
  }

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
  }

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
    const facet = require('./data/page').collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])]).find(f => f.content.nav === nav.set)
    if (!facet || facet.content.hierarchy) return res.sendStatus(404)
    const fcl = this.fclPage(req, parents[0].set, parents.length, parents)
    if (fcl) ids.setColumn(fcl.column)

    if (csv) return this.sectionCsv(req, res, tx, { facet, parentType, parentKeys })
    const skip = Math.max(Number(req.query.$skip) || 0, 0)
    const page = await require('./data/section').sectionPage(tx, { parentEntityType: parentType, parentKeys, content: facet.content, query: req.query, skip })
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
  }

  /** `GET <object>/<nav>/$export`: the whole table of a section (with its search and sort, the visible columns `cols`) as CSV. */
  async sectionCsv(req, res, tx, { facet, parentType, parentKeys }) {
    const { sectionPage } = require('./data/section')
    const rows = await csvLib.readAll((skip, limit) => sectionPage(tx, { parentEntityType: parentType, parentKeys, content: facet.content, query: req.query, skip, limit }), EXPORT_LIMIT)
    const columns = this.csvColumns(req, facet.content.columns)
    const resolve = text => i18n.resolveText(text, cache.bundleFor(this.appOpts(req)))
    res.set(csvLib.csvHeaders(facet.content.nav, resolve(facet.label ?? facet.content.nav)))
    res.send(csvLib.toCsv(columns.map(({ col }) => resolve(col.label ?? col.field?.label ?? '')), rows.map(row => columns.map(({ col }) => cellText(col, row)))))
  }

  /** The columns of a table that an export covers: the ones with a field, and of those only the positions named by `cols` (all when absent). */
  csvColumns(req, tableColumns) {
    const wanted = typeof req.query.cols === 'string' ? new Set(req.query.cols.split(',').map(Number)) : null
    return tableColumns.map((col, index) => ({ col, index })).filter(({ col, index }) => col.field && (!wanted || wanted.has(index)))
  }

  /** What the user may do with an entity set: draft vs direct editing and the `Capabilities.*Restrictions`
   *  (`model/edit-capabilities.js`). Every mutating route asks this first, so a `@readonly` set can
   *  neither be created in nor deleted from by posting to a URL the UI never offers. */
  editOf(req, entityType) {
    return editCapabilities(cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req)), entityType)
  }

  /** A text of the plugin/model/app bundle in the request's locale. */
  text(req, key) {
    return i18n.t(cache.bundleFor(this.appOpts(req)), key)
  }

  /** Adds events to the response's `HX-Trigger` (a JSON object of event names), keeping those an earlier step set, such as
   *  `hf:appUpdated` from the app check. Returns `res`. */
  trigger(res, json) {
    const before = res.getHeader('HX-Trigger')
    if (!before) return res.set('HX-Trigger', json)
    return res.set('HX-Trigger', JSON.stringify({ ...JSON.parse(before), ...JSON.parse(json) }))
  }

  /** `<hx-partial>` that puts message strips into `#messages` (outside `#app`, so it also has to be cleared). */
  messagesPartial(msgs) {
    return partial('#messages', 'outerHTML', messageRender.messages(msgs).value)
  }

  /** Refuses an action with a message strip and leaves the page as it is (only the partial is swapped). */
  reject(req, res, status, key, arg) {
    res.status(status).type('html').send(this.messagesPartial([{ severity: 'error', message: this.text(req, key).replace('{0}', arg ?? '') }]))
  }

  /** User-fixable problems (validation, bad input) as opposed to bugs and auth failures. */
  static isUserError(err) {
    const status = err.status ?? err.statusCode
    return err instanceof InputError || (status >= 400 && status < 500 && status !== 401 && status !== 403)
  }

  static messagesOf(err) {
    return [err, ...(err.details || [])].map(e => ({ severity: 'error', message: e.message }))
  }

  /** A refused edit/save: the page stays as it is, the messages go to the page script (value states on the
   *  fields and the footer's message button, like FE). The body only clears the message strip: 4xx bodies are
   *  swapped by htmx, and an empty one would empty the page. */
  validationFailed(req, res, entityType, messages, { status = 422, contextPath } = {}) {
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), entityType, contextPath ?? `/${entityType.split('.').pop()}`, this.appOpts(req))
    this.trigger(res.status(status), draftMessages.triggerHeader({ set: draftMessages.labelled(messages, layout) })).type('html').send(this.messagesPartial([]))
  }

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

    let body = objectPageRender.objectPageFragment(opLayout, row, {
      basePath: base, entitySetPath, trail, children, bundle, t: i18n.t, valueLists, editMode,
      successMessage: req.successMessage, messages: persisted, fcl, locale: cds.context.locale
    })
    if (messages?.length) body = html`${rawHtml(this.messagesPartial(messages))}${body}`
    if (status) res.status(status)
    this.render(req, res, { title, body, keepMessages: !!messages?.length, fcl })
  }

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
  }

  /** `POST /:Set` (§routes: "Create (NEW draft)"): makes an empty draft and redirects straight into
   *  its (draft) Object Page, matching FE's "Create" -> edit-mode OP navigation. Draft roots only. */
  async createDraft(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode !== 'draft' || !canCreate(edit)) return this.reject(req, res, 405, 'NotAllowed')
    const pk = await draftLib.create(tx, entity.name, {})
    const keys = { ...pk, IsActiveEntity: false }
    const raw = keysLib.formatKeys(keys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${req.params.Set}(${raw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys, segments: [{ set: req.params.Set, raw }], contextPath: `/${req.params.Set}`
    })
  }

  /** What the table section of an Object Page allows (`model/object-page.js`): the answer the page itself used to offer or hide Create,
   *  Delete and the inputs, so that a request made by hand is refused the same way. `{}` (everything) when the section is unknown. */
  sectionCaps(req, rootType, rootSet, nav) {
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), rootType, `/${rootSet}`, this.appOpts(req))
    return require('./data/page').collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])]).find(f => f.content.nav === nav)?.content.capabilities || {}
  }

  /** `POST /:Set(keys)/:nav`: Create in a table section of a draft. Like FE (creation mode "NewPage") it makes the
   *  child's own draft row, linked to the parent through the composition's foreign key, and opens its page. */
  async createChild(req, res, tx) {
    const { set, raw: parentRaw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const parent = this.entitySet(set)
    if (!parent || parentRaw == null) return res.sendStatus(404)
    if (this.editOf(req, parent.name).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const nav = req.params.nav
    const element = resolveElement(cds.model, parent.name, nav)
    if (!element?.target) return res.sendStatus(404)
    if (this.sectionCaps(req, parent.name, set, nav).insertable === false) return this.reject(req, res, 405, 'NotAllowed')
    const parentKeys = keysLib.parseKeys(parentRaw)
    const { IsActiveEntity: _active, ...plainParent } = parentKeys
    const assoc = backlinkElement(cds.model, element.target, parent.name)
    const defaults = assoc ? Object.fromEntries(Object.entries(plainParent).map(([k, v]) => [`${assoc}_${k}`, v])) : {}
    const childKeys = await draftLib.createChild(tx, parent.name, parentKeys, nav, defaults)
    const childRaw = keysLib.formatKeys(childKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${parentRaw})/${nav}(${childRaw})`)
    return this.objectPage(req, res, tx, {
      entityType: element.target, keys: childKeys, segments: [{ set, raw: parentRaw }, { set: nav, raw: childRaw }], contextPath: `/${set}/${nav}`
    })
  }

  /** `POST /…(keys)/$edit` (§routes). Draft root: EDIT the active instance into a draft and show it; if
   *  the object already has your own draft, that one is resumed, someone else's draft locks it (409).
   *  Non-draft: FE V4 edits the active entity directly, so this only shows the same page in edit mode. */
  async editDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const edit = this.editOf(req, entity.name)
    const { IsActiveEntity: _active, ...plainKeys } = keys
    const current = await tx.run(SELECT.one.from(entity.name).where(edit.mode === 'draft' ? { ...plainKeys, IsActiveEntity: true } : plainKeys))
    if (!current) return res.sendStatus(404)
    if (!canEdit(edit, current)) return this.reject(req, res, 405, 'NotAllowed')

    try {
      await draftLib.edit(tx, entity.name, { ...plainKeys, IsActiveEntity: true })
    } catch (err) {
      if ((err.status ?? err.statusCode ?? err.code) !== 409) throw err
      const lockedBy = await queryLib.draftLockUser(tx, entity.name, { ...plainKeys, IsActiveEntity: false })
      if (lockedBy && lockedBy !== cds.context.user.id) {
        return this.reject(req, res, 409, 'LockedBy', lockedBy)
      }
      // your own draft: resume it
    }
    const draftKeys = { ...plainKeys, IsActiveEntity: false }
    const draftRaw = keysLib.formatKeys(draftKeys)
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${draftRaw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys: draftKeys, segments: [{ set, raw: draftRaw }], contextPath: `/${set}`
    })
  }

  /** `PATCH /…(keys)/$field/:path` (§routes): patches one draft field. The response carries the other
   *  places showing the same property (header title, other facets) as `<hx-partial>`s, so the page reflects
   *  the draft immediately; annotated `Common.SideEffects` follow over SSE after the response. */
  async patchField(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    if (this.editOf(req, entity.name).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const keys = keysLib.parseKeys(raw)
    const path = req.params.path
    const value = req.body?.[path]
    // A key typed into a value-help field has to exist in its value list (the draft is not changed otherwise)
    const field = require('./model/fields').buildField(cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req)), entity.name, path)
    if (field?.valueList && !field.fixedValues && !(await valueListLib.keyExists(tx, field.valueList, value))) {
      return this.validationFailed(req, res, entity.name, [{ path, text: this.text(req, 'InvalidValue'), severity: 'error' }], { status: 422, contextPath: `/${set}` })
    }
    try {
      await draftLib.patch(tx, entity.name, keys, { [path]: value })
    } catch (err) {
      if (!HtmxAdapter.isUserError(err)) throw err
      return this.validationFailed(req, res, entity.name, [{ ...draftMessages.fromError(err)[0], path }], { status: 422, contextPath: `/${set}` })
    }
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys, contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath: `${set}(${raw})` }
    const header = req.headers['x-hf-source']
    const source = typeof header === 'string' && /^[\w-]+$/.test(header) ? header : null
    const { parts, layout, row, title } = await engine.bindingParts(tx, view, { path, source, ...this.appOpts(req) })
      .catch(err => { cds.log('htmx').error('binding refresh for', path, 'failed:', err.message); return { parts: [], layout: null, row: null, title: null } })
    // The value is valid again (clear its message) unless it is a mandatory field the user emptied
    const missing = layout ? draftMessages.missingMandatory(layout, row, [path], this.text(req, 'MissingValue')) : []
    this.trigger(res, draftMessages.triggerHeader({ clear: [path], set: draftMessages.labelled(missing, layout ?? {}), title }))
    const status = partial(`#${ids.opDraftStatus()}`, 'innerHTML', this.text(req, 'DraftSavedStatus'))
    // clears a stale validation strip as well
    const markup = [this.messagesPartial([]), status, ...(parts.length ? [engine.partialsMarkup(parts)] : [])].join('\n')
    res.status(200).type('html').send(markup)
    // The response is out; annotated side effects are pushed over SSE inside this same transaction, so they see the patch
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    // the page asks for the effects to wait until the focus leaves the field group (`POST $effects` then runs them)
    if (req.headers['x-hf-defer'] === '1') return engine.defer(clientId, view.entitySetPath, path)
    await engine.onChange(tx, view, { clientId, properties: [path] })
      .catch(err => cds.log('sse').error('side effects for', path, 'failed:', err.message))
  }

  /** Parses a path below a draft root: `Books(k)/chapters(k2)` followed by `/$field/title` (a change) or
   *  `/$delete` (a bulk delete), or nothing (the child itself). Walks the navigation chain structurally
   *  (CSN) like `subObjectPage`. Returns the child's entity type and keys, the parent it belongs to and the
   *  key string the client uses for this row (`chapters(ID='…',IsActiveEntity=false)`). */
  parseNested(req) {
    let full = (req.params.splat || []).join('/')
    let action = null
    let property = null
    const field = /\/\$field\/(\w+)$/.exec(full)
    if (field) { action = 'field'; property = field[1]; full = full.slice(0, field.index) } else if (/\/\$delete$/.test(full)) { action = 'delete'; full = full.slice(0, -'/$delete'.length) } else if (/\/\$paste$/.test(full)) { action = 'paste'; full = full.slice(0, -'/$paste'.length) }
    const segments = keysLib.splitSegments(full)
    if (segments.length < 2 || segments[0].raw == null) return null
    const top = this.entitySet(segments[0].set)
    if (!top) return null
    const types = [top.name]
    for (let i = 1; i < segments.length; i++) {
      const element = resolveElement(cds.model, types[i - 1], segments[i].set)
      if (!element?.target) return null
      types.push(element.target)
    }
    const last = segments.length - 1
    const target = segments[last]
    const parentSegments = segments.slice(0, last)
    const pathOf = segs => segs.map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
    return {
      action, property, segments, nav: target.set,
      root: { set: segments[0].set, raw: segments[0].raw, entityType: top.name, keys: keysLib.parseKeys(segments[0].raw) },
      entityType: types[last], raw: target.raw, keys: target.raw == null ? null : keysLib.parseKeys(target.raw),
      parent: { entityType: types[last - 1], segments: parentSegments, path: pathOf(parentSegments), keys: keysLib.parseKeys(parentSegments[last - 1].raw), contextPath: `/${segments[0].set}${parentSegments.slice(1).map(s => `/${s.set}`).join('')}` },
      rowKey: target.raw == null ? null : `${target.set}(${target.raw})`,
      path: pathOf(segments)
    }
  }

  /** The parent page again (after a child row changed or was deleted), with its own URL pushed. */
  parentPage(req, res, tx, n, { push }) {
    if (push) res.set('HX-Replace-Url', `${this.basePath(req)}/${n.parent.path}`)
    return this.objectPage(req, res, tx, { entityType: n.parent.entityType, keys: n.parent.keys, segments: n.parent.segments, contextPath: n.parent.contextPath })
  }

  /** `POST /:Set(keys)/$effects`: the focus left a field group, so the side effects of the changes made in it run now (what the
   *  PATCHes with `X-Hf-Defer` left waiting for this page and object). Answers 204 whether or not something was waiting. */
  async flushEffects(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    const clientId = req.headers['x-htmx-client']
    if (!entity || raw == null || typeof clientId !== 'string') return res.sendStatus(404)
    const entitySetPath = `${set}(${raw})`
    const properties = engine.takeDeferred(clientId, entitySetPath)
    if (properties.length) {
      const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys: keysLib.parseKeys(raw), contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath }
      await engine.onChange(tx, view, { clientId, properties })
        .catch(err => cds.log('sse').error('side effects for', properties.join(','), 'failed:', err.message))
    }
    res.sendStatus(204)
  }

  /** `PATCH …/chapters(k)/$field/:path`: a cell of a child row, or a field of a child page, in a draft. The
   *  child is its own draft entity (`IsActiveEntity=false`); mandatory cells get a value state like FE. */
  async patchNested(req, res, tx) {
    const n = this.parseNested(req)
    if (!n || n.action !== 'field' || !n.keys) return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    if (this.editOf(req, n.entityType).updatable === false || (n.segments.length === 2 && this.sectionCaps(req, n.root.entityType, n.root.set, n.nav).updatable === false)) return this.reject(req, res, 405, 'NotAllowed')
    const key = `${n.rowKey}.${n.property}`
    try {
      await draftLib.patch(tx, n.entityType, n.keys, { [n.property]: req.body?.[n.property] })
    } catch (err) {
      if (!HtmxAdapter.isUserError(err)) throw err
      return this.validationFailed(req, res, n.root.entityType, [{ ...draftMessages.fromError(err)[0], path: key }], { status: 422, contextPath: `/${n.root.set}` })
    }
    const header = req.headers['x-hf-source']
    const source = typeof header === 'string' && /^[\w-]+$/.test(header) ? header : null
    const ownPage = ids.unprefixed(source ?? '').startsWith('op-field--')
    // a field of the child's own page is in the child's column, a cell of a table section is in its parent's
    if (this.fclOf(req, n.root.set)) ids.setColumn(ownPage ? n.segments.length : n.segments.length - 1)
    const status = partial(`#${ids.opDraftStatus()}`, 'innerHTML', this.text(req, 'DraftSavedStatus'))
    if (ownPage) {
      // A field of the child's own page: same as a field of the root page (other occurrences, header title, validation)
      const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: n.entityType, keys: n.keys, contextPath: n.parent.contextPath + `/${n.nav}`, basePath: this.basePath(req), entitySetPath: n.path }
      const { parts, layout: childLayout, row: childRow } = await engine.bindingParts(tx, view, { path: n.property, source, ...this.appOpts(req) })
        .catch(err => { cds.log('htmx').error('binding refresh for', n.property, 'failed:', err.message); return { parts: [], layout: null, row: null } })
      const missingField = childLayout ? draftMessages.missingMandatory(childLayout, childRow, [n.property], this.text(req, 'MissingValue')) : []
      this.trigger(res, draftMessages.triggerHeader({ clear: [n.property], set: draftMessages.labelled(missingField, childLayout ?? {}) }))
      res.status(200).type('html').send([this.messagesPartial([]), status, ...(parts.length ? [engine.partialsMarkup(parts)] : [])].join('\n'))
    } else {
      // A cell of the table section that shows this row: a mandatory cell the user emptied is flagged
      const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), n.root.entityType, `/${n.root.set}`, this.appOpts(req))
      const column = require('./data/page').collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])])
        .find(f => f.content.nav === n.nav)?.content.columns.find(c => c.field?.path === n.property)
      const { IsActiveEntity: _a, ...plain } = n.keys
      const row = await tx.run(SELECT.one.from(n.entityType).where(entityDef(cds.model, n.entityType)?.elements?.IsActiveEntity ? { ...plain, IsActiveEntity: false } : plain))
      const missing = column && row && require('./render/field').isMandatory(column.field, row) && draftMessages.isEmpty(row[column.field.cqlPath])
        ? [{ path: key, text: this.text(req, 'MissingValue'), severity: 'error', label: column.field.label }] : []
      this.trigger(res, draftMessages.triggerHeader({ clear: [key], set: missing }))
      res.status(200).type('html').send([this.messagesPartial([]), status].join('\n'))
    }
    // Annotated side effects of the root (e.g. Chapters -> totalPages) are pushed over SSE after the response
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: n.root.entityType, keys: n.root.keys, contextPath: `/${n.root.set}`, basePath: this.basePath(req), entitySetPath: `${n.root.set}(${n.root.raw})` }
    await engine.onChange(tx, view, { clientId, navigations: [n.segments[1].set] })
      .catch(err => cds.log('sse').error('side effects for', n.nav, 'failed:', err.message))
  }

  /** `POST …/chapters/$delete`: deletes the ticked rows of a table section of the draft: the draft rows of a composition (CANCEL of
   *  the child draft, the saved row stays until the root is saved), the rows of an association table (a non-draft entity such as
   *  Authors.books) for real, like FE. */
  async postNested(req, res, tx) {
    const n = this.parseNested(req)
    if (n?.action === 'paste') return this.pasteRows(req, res, tx, n)
    if (!n || n.action !== 'delete') return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    if (this.editOf(req, n.entityType).deletable === false || (n.segments.length === 2 && this.sectionCaps(req, n.root.entityType, n.root.set, n.nav).deletable === false)) return this.reject(req, res, 405, 'NotAllowed')
    const draftNode = !!entityDef(cds.model, n.entityType)?.elements?.IsActiveEntity
    for (const raw of [].concat(req.body?.keys ?? []).slice(0, 200)) {
      const keys = keysLib.parseKeys(raw)
      if (draftNode) await draftLib.discard(tx, n.entityType, keys)
      else await tx.run(DELETE.from(n.entityType).where(keys))
    }
    // the segment list of the section is the parent's own
    return this.objectPage(req, res, tx, { entityType: n.parent.entityType, keys: n.parent.keys, segments: n.parent.segments, contextPath: n.parent.contextPath })
  }

  /** `POST …/chapters/$paste` (FE: paste rows from a spreadsheet into a table of the draft). `cols` names the
   *  columns the pasted cells belong to (JSON array of properties), `rows` the pasted rows (JSON array of arrays of
   *  text). Only editable columns of this table are taken; every row is converted first, so nothing is created when one
   *  cell is invalid. One child draft per row, linked to the parent like Create. */
  async pasteRows(req, res, tx, n) {
    if (n.segments.length !== 2 || n.raw != null) return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const caps = this.sectionCaps(req, n.root.entityType, n.root.set, n.nav)
    if (caps.insertable === false || caps.updatable === false) return this.reject(req, res, 405, 'NotAllowed')
    let cols, rows
    try { cols = JSON.parse(req.body?.cols); rows = JSON.parse(req.body?.rows) } catch { return res.sendStatus(400) }
    if (!Array.isArray(cols) || !Array.isArray(rows) || rows.length > 200 || rows.some(r => !Array.isArray(r))) return res.sendStatus(400)

    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), n.root.entityType, `/${n.root.set}`, this.appOpts(req))
    const { isReadOnly } = require('./render/field')
    const columns = require('./data/page').collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])])
      .find(f => f.content.nav === n.nav)?.content.columns || []
    const editable = new Map(columns.filter(c => c.kind === 'UI.DataField' && c.field?.cqlPath && !c.field.cqlPath.includes('.') && !isReadOnly(c.field, {}, 'draft')).map(c => [c.field.path, c.field]))
    const picked = cols.map(c => editable.get(c) ?? null)

    const assoc = backlinkElement(cds.model, n.entityType, n.root.entityType)
    const { IsActiveEntity: _a, ...plainParent } = n.root.keys
    const defaults = assoc ? Object.fromEntries(Object.entries(plainParent).map(([k, v]) => [`${assoc}_${k}`, v])) : {}
    const { coerce, InputError } = require('./data/form')
    let data
    try {
      data = rows.map(cells => {
        const values = { ...defaults }
        picked.forEach((field, i) => {
          if (!field || cells[i] == null) return
          const element = resolveElement(cds.model, n.entityType, field.cqlPath)
          values[field.cqlPath] = coerce(element, String(cells[i]).trim(), field.label || field.path, field.path)
        })
        return values
      })
    } catch (err) {
      if (!(err instanceof InputError)) throw err
      return this.reject(req, res, 422, 'PasteInvalid', err.message)
    }
    for (const values of data) await draftLib.createChild(tx, n.root.entityType, n.root.keys, n.nav, values)
    return this.parentPage(req, res, tx, n, { push: false })
  }

  /** `GET /:Set/$vh/:path?$search=...` (§routes): Value-help dialog for @Common.ValueList (unbounded, searchable). */
  async valueHelp(req, res, tx) {
    const { set } = keysLib.splitSegments(req.params.Set)[0] || {}
    const { raw: keyRaw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const path = req.params.path
    const search = String(req.query.$search || '')
    const target = /^[\w.]+$/.test(String(req.query.target || '')) ? String(req.query.target) : path

    const store = cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req))
    const fieldsLib = require('./model/fields')
    const field = fieldsLib.buildField(store, entity.name, path)
    const parsed = valueListLib.parseValueList(field?.valueList)
    if (!parsed) return res.sendStatus(404)
    const { collectionPath, valueProp, columns: props, searchSupported } = parsed

    // Column headers: the value list entity's own labels (Common.Label), like FE's table
    const collectionType = collectionPath.includes('.') ? collectionPath : `${this.service.name}.${collectionPath}`
    const bundle = cache.bundleFor(this.appOpts(req))
    const labelOf = label => i18n.resolveText(label, bundle) // labels are still {i18n>Key} placeholders here
    const columns = props.map(prop => ({ prop, label: labelOf(fieldsLib.buildField(store, collectionType, prop)?.label ?? prop) }))
    const suggest = req.query.mode === 'suggest'
    let q = SELECT.from(collectionPath).columns(props)
    if (search && searchSupported) q = q.search(search)
    const limit = suggest ? 8 : 200
    // per-column filters of the dialog ("Show Filters"): `c.<column>` contains, columns whitelisted from the value list
    const columnFilters = {}
    for (const prop of props) {
      const v = req.query[`c.${prop}`]
      if (typeof v === 'string' && v.trim()) { columnFilters[prop] = v.trim(); q = q.where(`${prop} like`, `%${v.trim()}%`) }
    }
    let rows = await tx.run(q.limit(limit))
    if (search && searchSupported && !Object.keys(columnFilters).length) {
      // `$search` only covers the text columns; what is typed is often the key itself (a UUID is not searched)
      try {
        const byKey = await tx.run(SELECT.from(collectionPath).columns(props).where(`${valueProp} like`, `%${search}%`).limit(limit))
        const seen = new Set(rows.map(r => r[valueProp]))
        rows = [...rows, ...byKey.filter(r => !seen.has(r[valueProp]))].slice(0, limit)
      } catch { /* key type not comparable with text: the search result stands */ }
    }

    const t = key => i18n.t(bundle, key)
    // Type-ahead under the input while typing: the best matches only
    if (suggest) return res.type('html').send(String(valueHelpRender.valueHelpSuggest(columns, rows, { valueProp, t })))
    // Searching only replaces the results, opening sends the whole dialog (into #dialogs)
    if (req.query.mode === 'results') {
      return res.type('html').send(String(valueHelpRender.valueHelpResults(columns, rows, { valueProp, t })))
    }
    const entitySetPath = keyRaw ? `${set}(${keyRaw})` : set
    res.type('html').send(String(valueHelpRender.valueHelpDialog({ ...field, label: labelOf(field.label) }, columns, rows, { basePath: this.basePath(req), entitySetPath, valueProp, search, searchSupported, t, target, filters: columnFilters })))
  }

  /** `POST /:Set/$action/:name` (§routes Phase 5d): Invoke a bound action and re-render the OP with the result. */
  async callAction(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const actionName = req.params.name
    const keys = keysLib.parseKeys(raw)
    const params = req.body || {}

    try {
      const actionFqn = `${this.service.name}.${entity.name}.${actionName}`
      await actionsLib.invokeAction(tx, actionFqn, keys, params)
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys, segments: [{ set, raw }], contextPath: `/${set}`
      })
    } catch (err) {
      this.reject(req, res, 400, 'ActionFailed', err.message)
    }
  }

  /** `POST /…(keys)/$save` and `POST /:Set/$save` (§routes). Draft root: SAVE activates the draft, the
   *  response is the active OP plus a toast. Non-draft: Save PATCHes the active entity with the edit
   *  form, and without keys Create POSTs a new one -- straight to the active entity, as FE V4 does.
   *  Rejected input re-shows the form as typed (422) with the messages. */
  async saveDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)

    if (edit.mode === 'draft') {
      const keys = keysLib.parseKeys(raw)
      try {
        await draftLib.save(tx, entity.name, keys)
      } catch (err) {
        if (!HtmxAdapter.isUserError(err)) throw err
        req.hfFailure = e => this.validationFailed(req, res, entity.name, draftMessages.fromError(e), { status: 422, contextPath: `/${set}` })
        throw err // roll back: CAP stores the failed activation's messages as the draft's DraftMessages
      }
      const activeKeys = { ...keys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      req.successMessage = this.text(req, 'ObjectSaved')
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    return this.reject(req, res, 405, 'NotAllowed') // only a draft root is saved: nothing else is edited
  }

  /** `POST /…(keys)/$discard` and `POST /:Set/$discard` (§routes). Draft root: DISCARD deletes the draft; a
   *  brand-new draft has nothing to go back to but the List Report, an edited one goes back to its (still
   *  existing) active OP. Non-draft: nothing was stored, so Cancel just shows the saved object again
   *  (or the List Report when cancelling a create). */
  async discardDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const keys = keysLib.parseKeys(raw)
    const { IsActiveEntity: _ignored, ...plainKeys } = keys
    const draftRow = await tx.run(SELECT.one.from(entity.name).columns('HasActiveEntity').where({ ...plainKeys, IsActiveEntity: false }))
    await draftLib.discard(tx, entity.name, keys)
    if (draftRow?.HasActiveEntity) {
      const activeKeys = { ...plainKeys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
  }

  /** `DELETE /:Set(keys)` (§routes): deletes the object, then the List Report. */
  async deleteEntity(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const edit = this.editOf(req, entity.name)
    const current = await tx.run(SELECT.one.from(entity.name).where(keys))
    if (!current) return res.sendStatus(404)
    if (!canDelete(edit, current)) return this.reject(req, res, 405, 'NotAllowed')
    await this.removeObject(tx, entity, edit, keys)
    req.successMessage = this.text(req, 'ObjectDeleted')
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
  }

  /** `POST /:Set/$delete` (List Report Delete): deletes every ticked row (`keys=<key segment>` per row). */
  async deleteSelected(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (!canDelete(edit)) return this.reject(req, res, 405, 'NotAllowed')
    const selected = [].concat(req.body?.keys ?? []).slice(0, 200)
    if (!selected.length) return this.reject(req, res, 400, 'NotAllowed')
    for (const raw of selected) {
      const keys = keysLib.parseKeys(raw)
      const current = await tx.run(SELECT.one.from(entity.name).where(keys))
      if (!current) continue
      if (!canDelete(edit, current)) return this.reject(req, res, 405, 'NotAllowed')
      await this.removeObject(tx, entity, edit, keys)
    }
    req.successMessage = this.text(req, 'ObjectDeleted')
    return this.listReport(req, res, tx)
  }

  /** Deletes an object: a draft is discarded, anything else is DELETEd (through the service, so restrictions and handlers apply). */
  async removeObject(tx, entity, edit, keys) {
    if (edit.mode === 'draft' && keys.IsActiveEntity === false) return draftLib.discard(tx, entity.name, keys)
    return tx.run(DELETE.from(entity.name).where(keys))
  }

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
  }

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
    const columns = this.csvColumns(req, lrLayout.table.columns)
    const resolve = text => i18n.resolveText(text, cache.bundleFor(opts))
    res.set(csvLib.csvHeaders(req.params.Set, resolve(lrLayout.header.typeNamePlural || req.params.Set)))
    res.send(csvLib.toCsv(columns.map(({ col }) => resolve(col.label ?? col.field?.label ?? '')), rows.map(row => columns.map(({ col }) => cellText(col, row)))))
  }

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
    // Go/sort keep the filter state in the (replaced, not pushed) URL, so Back from an object lands on the same list
    if (!req.query.$skip) {
      const params = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => v !== '' && !(k === 'f.EditingStatus' && v === 'ALL')))
      res.set('HX-Replace-Url', `${base}/${req.params.Set}${params.size ? '?' + params : ''}`)
      // the header (outside the swapped rows) shows which column the rows are sorted by
      this.trigger(res, JSON.stringify({ 'hf:sorted': { path: orderBy?.path ?? '', desc: !!orderBy?.desc } }))
    }
    res.set('Content-Type', 'text/html').send(String(body))
  }

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
    return { rows: pageRows, hasMore, count: counted.count }
  }

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

  /** Wraps a handler so it runs inside a service transaction and errors reach the HttpAdapter error handler. */
  handle(fn) {
    const srv = this.service
    // `req.hfFailure`: a handler that wants to answer an error itself, AFTER the transaction rolled back
    // (CAP persists draft messages from the rollback of a failed activation, so the error must propagate)
    // In a Flexible Column Layout the ids of the page depend on its column (render/ids.js): the request path says which one
    const run = (req, res) => srv.tx(req, tx => fn.call(this, req, res, tx))
    return (req, res, next) => {
      const column = this.fclColumnOfPath(req)
      return (column == null ? run(req, res) : ids.inColumn(column, () => run(req, res))).catch(err => req.hfFailure ? req.hfFailure(err) : next(err))
    }
  }

  /** How pages move (the manifest's `sap.htmx.animations`: `full`, `fast`, `none`); the page carries `hf-motion-fast` / `hf-no-motion`. */
  animationsOf(req) {
    const { appRoot: root, app } = this.appOpts(req)
    return cache.animationsFor(this.odataServicePath(), { appRoot: root, app })
  }

  /** The Flexible Column Layout (`{ two, three }`) the entity set of a path opens in, or `undefined`. */
  fclOf(req, set) {
    const { appRoot: root, app } = this.appOpts(req)
    return set ? cache.fclFor(this.odataServicePath(), set, { appRoot: root, app }) : undefined
  }

  /** The column a request path belongs to: `/Books` 0, `/Books(k)` 1, `/Books(k)/chapters(k2)` 2 (`$`-segments such as
   *  `$field` or `$table` belong to the page before them); `null` when the set does not open in columns. */
  fclColumnOfPath(req) {
    const segments = req.path.split('/').filter(Boolean).filter(seg => !seg.startsWith('$'))
    if (!segments.length) return null
    const first = keysLib.splitSegments(segments[0])[0]
    if (!this.fclOf(req, first?.set)) return null
    const last = keysLib.splitSegments(segments[segments.length - 1])[0]
    return last?.raw == null ? segments.length - 1 : segments.length
  }

  /** What a page needs to render in its column of a Flexible Column Layout, or `undefined` outside one. `segments` is the
   *  entity path of the page (empty for a List Report): the URL of every column before it, to load them on a direct visit. */
  fclPage(req, set, column, segments = []) {
    const layouts = this.fclOf(req, set)
    if (!layouts) return undefined
    const base = this.basePath(req)
    const pathOf = n => segments.slice(0, n).map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
    const urls = Array.from({ length: Math.max(column, 0) }, (_, n) => n === 0 ? `${base}/${set}` : `${base}/${pathOf(n)}`)
    return { layouts, column, urls, url: column > 0 ? `${base}/${pathOf(column)}` : `${base}/${set}`, closeHref: column > 0 ? urls[column - 1] : undefined }
  }

  /** `X-Hf-Fcl: shown`: the page of this URL is already in its column (Close on a column), nothing is rendered, the
   *  columns to the right are trimmed and the layout follows. */
  fclShown(req, res, next) {
    if (req.method !== 'GET' || req.headers['x-hf-fcl'] !== 'shown') return next()
    const column = this.fclColumnOfPath(req)
    if (column == null) return next()
    const layouts = this.fclOf(req, keysLib.splitSegments(req.path.split('/').filter(Boolean)[0])[0].set)
    res.set('Content-Type', 'text/html').send(fclRender.trim(column, layouts))
  }

  isFragmentRequest(req) {
    return !!req.headers['hx-request'] && !req.headers['hx-history-restore-request']
  }

  /** Every page replaces `#app`; the message strips live outside it, so a page without messages of its own
   *  clears the previous page's (`keepMessages`: the page brings its own). */
  render(req, res, { title, body, keepMessages, fcl }) {
    // The page says whether it wants the event stream (`#hf-live`); the page script opens or closes it (§4.1)
    const view = req.hfView
    const live = !!view && engine.needsStream(cache.storeFor(cds.model, view.service, view.servicePath, this.appOpts(req)), view.entityType, { list: !!view.list })
    const liveSpan = html`<span id="hf-live" hidden data-hf-live="${live ? '1' : '0'}"></span>`
    if (fcl) {
      // Flexible Column Layout (render/fcl.js): the page already on screen gets its column swapped, any other request the whole layout
      const mode = String(req.headers['x-hf-fcl'] || '')
      const { partials, body: pageBody } = fclRender.hoistPartials(body)
      if (mode && this.isFragmentRequest(req)) {
        const keep = mode === 'keep'
        // the first page being edited, saved or discarded with a page open in the third column: that column stays and follows (htmx-fiori.js)
        const keepDeeper = req.headers['x-hf-fcl-keep'] === '1' && fcl.column >= 1
        const clear = keepMessages || keep ? '' : this.messagesPartial([])
        const swapLive = keep ? '' : partial('#hf-live', 'outerHTML', liveSpan.value)
        const markup = `${keep ? '' : `<title>${String(html`${title}`)}</title>`}${clear}${partials}${fclRender.columnPartials(fcl.column, pageBody, { layouts: fcl.layouts, keep, keepDeeper, url: fcl.url })}${swapLive}`
        return res.set('Content-Type', 'text/html').send(markup)
      }
      body = html`${rawHtml(partials)}${fclRender.structure(fcl.column, pageBody, fcl)}`
    }
    body = html`${body}${liveSpan}`
    if (this.isFragmentRequest(req) || req.htmxApp) {
      const clear = keepMessages ? '' : this.messagesPartial([])
      res.set('Content-Type', 'text/html').send(String(layout.fragment({ title, body: html`${rawHtml(clear)}${body}` })))
    } else {
      const clientId = channels.newClientId()
      channels.rememberView(clientId, req.hfView)
      res.set('Content-Type', 'text/html').send(String(layout.page({ title, clientId, basePath: this.basePath(req), assetBase: req.htmxBase || '', body, texts: textsFor(cache.bundleFor(this.appOpts(req))), animations: this.animationsOf(req) })))
    }
  }

  /** Dev-only SSE playground (see `render/playground.js`); 404 in production. */
  playgroundEnabled() {
    return !cds.env.production
  }

  playgroundClientRows() {
    return [...channels.clients.entries()].map(([id, c]) => ({
      id, user: c.user?.id ?? '?', app: c.app,
      view: !c.view ? 'nothing yet' : c.view.list ? `List Report ${c.view.set}` : `${c.view.entitySetPath} (${c.view.keys?.IsActiveEntity === false ? 'draft' : 'display'})`
    }))
  }

  async playground(req, res, tx) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const base = this.basePath(req)
    const links = []
    let exampleId
    for (const [name, entity] of Object.entries(this.service.entities)) {
      if (!entity['@UI.LineItem'] || name.endsWith('.drafts')) continue
      const keyNames = keyElements(entity).map(k => k.name).filter(n => n !== 'IsActiveEntity')
      links.push({ href: `${base}/${name}`, label: `${name} (List Report)` })
      const rows = await tx.run(SELECT.from(entity.name).columns(keyNames).limit(5)).catch(() => [])
      for (const row of rows) {
        const keys = { ...row, ...(entity.drafts ? { IsActiveEntity: true } : {}) }
        exampleId ??= row.ID
        links.push({ href: `${base}/${name}(${keysLib.formatKeys(keys)})`, label: `${name} ${Object.values(row).join(', ')}` })
      }
    }
    const actions = Object.entries(this.service.actions || {}).map(([name, def]) => ({
      name,
      params: Object.entries(def.params || {}).map(([pname, p]) => ({
        name: pname, type: String(p.type).replace('cds.', ''), example: p.type === 'cds.UUID' ? exampleId : p.type === 'cds.Integer' ? '10' : ''
      }))
    }))
    const watchSet = links.find(l => l.label.endsWith('(List Report)'))?.label.split(' ')[0]
    const body = playgroundRender.playground({ watchSet, basePath: base, service: this.service.name, links, actions, clients: this.playgroundClientRows(), t: x => x })
    this.render(req, res, { title: 'SSE playground', body })
  }

  /** The playground's own channel pretends to be a List Report of `set`, so row pushes show up in its log. */
  async playgroundWatch(req, res) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const entity = this.entitySet(String(req.body?.set))
    if (!entity || !channels.forUser(req.body?.client)) return res.sendStatus(404)
    channels.setView(req.body.client, this.viewOf(req, { entityType: entity.name, list: true, set: req.body.set }))
    res.sendStatus(204)
  }

  async playgroundClients(req, res) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    res.type('html').send(String(playgroundRender.clientsTable(this.playgroundClientRows(), { t: x => x })))
  }

  async playgroundAction(req, res, tx) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const def = this.service.actions?.[req.params.name]
    if (!def) return res.sendStatus(404)
    const params = {}
    for (const [name, p] of Object.entries(def.params || {})) {
      const raw = req.body?.[name]
      if (raw === undefined || raw === '') continue
      params[name] = ['cds.Integer', 'cds.Int32', 'cds.Int64'].includes(p.type) ? Number(raw) : raw
    }
    try {
      const result = await tx.send(req.params.name, params)
      res.type('html').send(String(html`ok${result === undefined ? '' : ' ' + JSON.stringify(result)}`))
    } catch (err) {
      res.status(200).type('html').send(String(html`failed: ${err.message}`))
    }
  }

  async home(req, res) {
    const srv = this.service
    const base = this.basePath(req)
    const names = Object.entries(srv.entities)
      .filter(([, e]) => e['@UI.LineItem'])
      .map(([name]) => name)
    const body = html`
      <section class="fd-dynamic-page">
        <h1 class="fd-title fd-title--h2">${srv.definition['@title'] || srv.name}</h1>
        <div class="fd-tile-grid">
          ${names.map(name => html`
            <a class="fd-tile" href="${base}/${name}" hx-get="${base}/${name}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">
              <div class="fd-tile__content">
                <span class="fd-tile__title">${name}</span>
              </div>
            </a>
          `)}
        </div>
        ${this.playgroundEnabled() ? html`<p class="hf-home__dev"><a class="fd-link" href="${base}/$playground">SSE playground (dev)</a></p>` : html``}
      </section>
    `
    this.render(req, res, { title: srv.name, body })
  }

  events(req, res) {
    const clientId = req.query.client
    if (!clientId) return res.sendStatus(400)
    openSse(res)
    channels.add(clientId, { res, user: cds.context.user, locale: cds.context.locale, app: req.htmxApp?.ref ?? null, view: channels.takePending(clientId) })
    writeSse(res, { event: 'connected', data: clientId })
    req.on('close', () => channels.remove(clientId, res))
  }
}

module.exports = HtmxAdapter
