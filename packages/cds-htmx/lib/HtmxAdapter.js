const cds = require('@sap/cds')
const express = require('express')
const HttpAdapter = require('@sap/cds/lib/srv/protocols/http')
const layout = require('./render/layout')
const { html } = require('./render/html')
const channels = require('./sse/channels')
const { open: openSse, write: writeSse } = require('./sse/stream')
const cache = require('./model/cache')
const i18n = require('./i18n')
const { appRoot } = require('./config')
const apps = require('./apps')
const { keyElements, entityDef, resolveElement } = require('./annotations/edm')
const { evaluate } = require('./annotations/expressions')
const keysLib = require('./keys')
const filtersLib = require('./data/filters')
const queryLib = require('./data/query')
const draftLib = require('./data/draft')
const actionsLib = require('./data/actions')
const valueListLib = require('./data/value-list')
const messageRender = require('./render/messages')
const toastRender = require('./render/toast')
const listReportRender = require('./render/list-report')
const objectPageRender = require('./render/object-page')
const valueHelpRender = require('./render/value-help')
const { loadObjectPage } = require('./data/page')
const engine = require('./sse/side-effects-engine')

/** `query.js#parseOrderBy()` returns CQL `orderBy` terms (`['stock desc']`); the table header
 *  renderer wants just the first term as `{path, desc}` to know which column's sort icon to show. */
function orderByFromTerms(terms) {
  if (!terms?.length) return undefined
  const [path, dir] = terms[0].split(' ')
  return { path, desc: dir === 'desc' }
}

/** `X-Htmx-Base`: absolute path segments only. */
const BASE_PATH = /^\/[\w.\-/~]*$/

class HtmxAdapter extends HttpAdapter {

  get router() {
    const router = super.router
    router.use(express.urlencoded({ extended: true, ...this.body_parser_options }))
    router.use(express.json(this.body_parser_options))
    router.use(this.logRequest.bind(this))
    router.use(this.resolveApp.bind(this))

    router.get('/', this.handle(this.home))
    router.get('/$events', this.handle(this.events))
    router.get('/:Set/$table', this.handle(this.tablePartial))
    router.post('/:Set/$edit', this.handle(this.editDraft))
    router.post('/:Set/$save', this.handle(this.saveDraft))
    router.post('/:Set/$discard', this.handle(this.discardDraft))
    router.patch('/:Set/$field/:path', this.handle(this.patchField))
    router.get('/:Set/$vh/:path', this.handle(this.valueHelp))
    router.post('/:Set/$action/:name', this.handle(this.callAction))
    router.post('/:Set/:nav', this.handle(this.createChild))
    router.post('/:Set', this.handle(this.createDraft))
    router.delete('/:Set', this.handle(this.deleteEntity))
    router.get('/:Set', this.handle(this.entityRoute))
    router.get('/*splat', this.handle(this.subObjectPage))

    return router
  }

  /** Logs incoming htmx and SSE requests (§logging: match OData's `[odata] -` format). */
  logRequest(req, res, next) {
    const method = req.method
    const path = req.path
    const isSSE = path === '/$events'
    const prefix = isSSE ? '[sse]' : '[htmx]'
    const hasQuery = Object.keys(req.query).length > 0

    const log = () => {
      if (isSSE) {
        console.error(`${prefix} - ${method} ${path} { client: '${req.query.client}' }`)
      } else if (hasQuery) {
        console.error(`${prefix} - ${method} ${path} ${JSON.stringify(req.query)}`)
      } else {
        console.error(`${prefix} - ${method} ${path}`)
      }
    }

    const originalJson = res.json
    const originalSend = res.send
    res.json = function(data) {
      log()
      return originalJson.apply(this, arguments)
    }
    res.send = function(data) {
      log()
      return originalSend.apply(this, arguments)
    }
    res.sendStatus = function(status) {
      log()
      return res.status(status).end()
    }

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
        if (outdated) res.set('HX-Trigger', 'hf:appUpdated')
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
  trackView(req, view) {
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    channels.setView(clientId, { service: this.service.name, servicePath: this.odataServicePath(), basePath: this.basePath(req), app: req.htmxApp, ...view })
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

  /** Object Page (§routes: `GET /:Set(keys)[/nav(keys)...]`): the full page/fragment -- header,
   *  header facets, sections (forms/dataPoint/contact/table), derived from the *whole* `OPLayout`
   *  tree, not just the LineItem/SideEffects slice (§3.1: "translate all resulting annotations to
   *  page layout, not just side effects"). */
  async objectPage(req, res, tx, { entityType, keys, segments, contextPath }) {
    const base = this.basePath(req)
    const { appRoot: root, locale, app } = this.appOpts(req)
    const servicePath = this.odataServicePath()

    const page = await loadObjectPage(tx, { service: this.service.name, servicePath, entityType, keys, contextPath, appRoot: root, locale, app })
    if (!page) return res.sendStatus(404)
    const { layout: opLayout, row, bundle, valueLists, children } = page
    const entitySetPath = segments.map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
    this.trackView(req, { entityType, keys, contextPath, entitySetPath })
    const title = evaluate(opLayout.header?.title?.Value, row) ?? opLayout.header?.typeName ?? segments[segments.length - 1].set
    const trail = [
      { label: i18n.t(bundle, 'Home'), href: '' },
      ...segments.map((seg, i) => i === segments.length - 1
        ? { label: title }
        : { label: seg.set, href: `/${segments.slice(0, i + 1).map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')}` })
    ]

    const body = objectPageRender.objectPageFragment(opLayout, row, {
      basePath: base, entitySetPath, trail, children, bundle, t: i18n.t, valueLists,
      successMessage: req.successMessage
    })
    this.render(req, res, { title, body })
  }

  /** `POST /:Set` (§routes: "Create (NEW draft)"): makes an empty draft and redirects straight into
   *  its (draft) Object Page, matching FE's "Create" -> edit-mode OP navigation. */
  async createDraft(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const pk = await draftLib.create(tx, entity.name, {})
    const keys = { ...pk, IsActiveEntity: false }
    const raw = keysLib.formatKeys(keys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${req.params.Set}(${raw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys, segments: [{ set: req.params.Set, raw }], contextPath: `/${req.params.Set}`
    })
  }

  /** `POST /:Set/:nav` (§routes Phase 5c): Create a child row in a navigation (table section) of a draft.
   *  The parent OP is re-rendered to show the new child row inline. */
  async createChild(req, res, tx) {
    const { set, raw: parentRaw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const parent = this.entitySet(set)
    if (!parent) return res.sendStatus(404)
    const parentKeys = keysLib.parseKeys(parentRaw)
    const nav = req.params.nav

    const element = resolveElement(cds.model, parent.name, nav)
    if (!element?.target) return res.sendStatus(404)

    const childEntity = this.entitySet(element.target.split('.').pop())
    if (!childEntity) return res.sendStatus(404)

    const childDefaults = { ...parentKeys }
    const childPk = await draftLib.create(tx, childEntity.name, childDefaults)
    const childKeys = { ...childPk, IsActiveEntity: false }

    return this.objectPage(req, res, tx, {
      entityType: parent.name, keys: parentKeys, segments: [{ set, raw: parentRaw }], contextPath: `/${set}`
    })
  }

  /** `POST /…(keys)/$edit` (§routes): EDIT the active instance into a draft, then render that draft's OP. */
  async editDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    await draftLib.edit(tx, entity.name, { ...keys, IsActiveEntity: true })
    const draftKeys = { ...keys, IsActiveEntity: false }
    const draftRaw = keysLib.formatKeys(draftKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${draftRaw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys: draftKeys, segments: [{ set, raw: draftRaw }], contextPath: `/${set}`
    })
  }

  /** `PATCH /…(keys)/$field/:path` (§routes): patches one draft field. The side-effects engine
   *  (Phase 6) is the eventual consumer of this change; for now the client keeps its own typed
   *  value, so a bare 204 is enough -- no re-render round trip needed. */
  async patchField(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const path = req.params.path
    const value = req.body?.[path]
    await draftLib.patch(tx, entity.name, keys, { [path]: value })
    res.sendStatus(204)
    // The response is out; the re-render is pushed over SSE inside this same transaction, so it sees the patch
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys, contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath: `${set}(${raw})` }
    await engine.onChange(tx, view, { clientId, properties: [path] })
      .catch(err => console.error('[sse] side effects for', path, 'failed:', err.message))
  }

  /** `GET /:Set/$vh/:path?$search=...` (§routes): Value-help dialog for @Common.ValueList (unbounded, searchable). */
  async valueHelp(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const path = req.params.path
    const search = req.query.$search || ''

    const store = cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req))
    const fieldsLib = require('./model/fields')
    const field = fieldsLib.buildField(store, entity.name, path)
    const valueList = field?.valueList
    if (!valueList) return res.sendStatus(404)

    const parsed = valueListLib.parseValueList(valueList)
    if (!parsed) return res.sendStatus(404)
    const { collectionPath, valueProp, textProp } = parsed

    let q = SELECT.from(collectionPath).columns([valueProp, textProp])
    if (search) q = q.search(search)
    const rows = await tx.run(q.limit(100))
    const options = rows.map(r => ({ value: r[valueProp], text: r[textProp] != null ? String(r[textProp]) : String(r[valueProp]) }))

    const body = valueHelpRender.valueHelpDialog(field, options, { basePath: this.basePath(req), entitySetPath: `${set}(${raw})`, collectionPath, valueProp, textProp })
    this.render(req, res, { title: `${field.label} - Value Help`, body })
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
      res.status(400).send(`Action failed: ${err.message}`)
    }
  }

  /** `POST /…(keys)/$save` (§routes): SAVE activates the draft; the response is the active OP plus success toast. */
  async saveDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    await draftLib.save(tx, entity.name, keys)
    const activeKeys = { ...keys, IsActiveEntity: true }
    const activeRaw = keysLib.formatKeys(activeKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
    req.successMessage = 'Object saved.'
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
    })
  }

  /** `POST /…(keys)/$discard` (§routes): DISCARD deletes the draft. A brand-new draft has nothing
   *  to go back to but the List Report; an edited one goes back to its (still existing) active OP. */
  async discardDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const { IsActiveEntity: _ignored, ...plainKeys } = keys
    const draftRow = await tx.run(SELECT.one.from(entity.name).columns('HasActiveEntity').where({ ...plainKeys, IsActiveEntity: false }))
    await draftLib.discard(tx, entity.name, keys)
    if (draftRow?.HasActiveEntity) {
      const activeKeys = { ...plainKeys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
  }

  /** `DELETE /:Set(keys)` (§routes): deletes the active object outright, then the List Report. */
  async deleteEntity(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    await tx.run(DELETE.from(entity.name).where(keys))
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
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
    this.trackView(req, { entityType, list: true, set: req.params.Set })
    const bundle = cache.bundleFor(opts)
    const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name)

    const parsedFilters = filtersLib.parseFilters(req.query, lrLayout)
    const search = filtersLib.parseSearch(req.query)
    const threshold = lrLayout.table.growingThreshold
    const columns = queryLib.selectColumns(cds.model, entityType, lrLayout)
    const orderByTerms = queryLib.parseOrderBy(req.query, columns)
    const q = queryLib.listReportQuery(cds.model, entityType, entityType, lrLayout, { filters: parsedFilters, search, query: req.query, limit: threshold })
    const countQ = queryLib.listReportCountQuery(entityType, { filters: parsedFilters, search })

    const [rows, countResult] = await Promise.all([tx.run(q), tx.run(countQ)])
    const hasMore = rows.length > threshold
    const pageRows = hasMore ? rows.slice(0, threshold) : rows
    const orderBy = orderByFromTerms(orderByTerms)

    const filterOptions = {}
    for (const field of lrLayout.filterBar.fields) {
      if (field.fixedValues && field.valueList) filterOptions[field.path] = await valueListLib.fixedValueOptions(tx, field.valueList)
    }

    const body = listReportRender.listReportFragment(lrLayout, pageRows, {
      basePath: base, entitySetPath: req.params.Set, keyNames, count: countResult.count,
      hasMore, skip: threshold, orderBy, query: req.query, bundle, t: i18n.t, filterOptions
    })
    this.render(req, res, { title: lrLayout.header.typeNamePlural, body })
  }

  /** Table body partial (§routes: `GET /:Set/$table`): sort (header click), search/filter ("Go"),
   *  and growing ("More") all land here and get just the `<tr>` rows (+ an `<hx-partial>` count
   *  refresh) back -- never a full page, since this is only ever reached via `hx-get`. */
  async tablePartial(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
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
    const q = queryLib.listReportQuery(cds.model, entityType, entityType, lrLayout, { filters: parsedFilters, search, query: req.query, skip, limit: threshold })
    const countQ = queryLib.listReportCountQuery(entityType, { filters: parsedFilters, search })

    const [rows, countResult] = await Promise.all([tx.run(q), tx.run(countQ)])
    const hasMore = rows.length > threshold
    const pageRows = hasMore ? rows.slice(0, threshold) : rows
    const orderBy = orderByFromTerms(orderByTerms)

    const body = listReportRender.tablePartial(lrLayout, pageRows, {
      basePath: base, entitySetPath: req.params.Set, keyNames, orderBy,
      skip: skip + threshold, hasMore, count: countResult.count, query: req.query, bundle, t: i18n.t
    })
    res.set('Content-Type', 'text/html').send(String(body))
  }

  /** Wraps a handler so it runs inside a service transaction and errors reach the HttpAdapter error handler. */
  handle(fn) {
    const srv = this.service
    return (req, res, next) => srv.tx(req, tx => fn.call(this, req, res, tx)).catch(next)
  }

  isFragmentRequest(req) {
    return !!req.headers['hx-request'] && !req.headers['hx-history-restore-request']
  }

  render(req, res, { title, body }) {
    if (this.isFragmentRequest(req) || req.htmxApp) {
      res.set('Content-Type', 'text/html').send(String(layout.fragment({ title, body })))
    } else {
      const clientId = channels.newClientId()
      res.set('Content-Type', 'text/html').send(String(layout.page({ title, clientId, basePath: this.basePath(req), assetBase: req.htmxBase || '', body })))
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
      </section>
    `
    this.render(req, res, { title: srv.name, body })
  }

  events(req, res) {
    const clientId = req.query.client
    if (!clientId) return res.sendStatus(400)
    openSse(res)
    channels.add(clientId, { res, user: cds.context.user, locale: cds.context.locale, app: req.htmxApp?.ref ?? null, view: null })
    writeSse(res, { event: 'connected', data: clientId })
    req.on('close', () => channels.remove(clientId))
  }
}

module.exports = HtmxAdapter
