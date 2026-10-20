const cds = require('@sap/cds')
const express = require('express')
const HttpAdapter = require('@sap/cds/lib/srv/protocols/http')
const layout = require('./render/layout')
const { html, raw: rawHtml } = require('./render/html')
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
const playgroundRender = require('./render/playground')
const toastRender = require('./render/toast')
const listReportRender = require('./render/list-report')
const objectPageRender = require('./render/object-page')
const valueHelpRender = require('./render/value-help')
const { loadObjectPage } = require('./data/page')
const { formValues, InputError } = require('./data/form')
const { editCapabilities, canCreate, canEdit, canDelete } = require('./model/edit-capabilities')
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
    router.get('/$playground', this.handle(this.playground))
    router.get('/$playground/clients', this.handle(this.playgroundClients))
    router.post('/$playground/watch', this.handle(this.playgroundWatch))
    router.post('/$playground/action/:name', this.handle(this.playgroundAction))
    router.get('/:Set/$new', this.handle(this.newObject))
    router.get('/:Set/$table', this.handle(this.tablePartial))
    router.post('/:Set/$delete', this.handle(this.deleteSelected))
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
  viewOf(req, view) {
    return { service: this.service.name, servicePath: this.odataServicePath(), basePath: this.basePath(req), app: req.htmxApp, ...view }
  }

  trackView(req, view) {
    // A full page load has no client id yet (it is created for the response): remember the view for it
    req.hfView = this.viewOf(req, view)
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    channels.setView(clientId, this.viewOf(req, view))
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

  /** `<hx-partial>` that puts message strips into `#messages` (outside `#app`, so it also has to be cleared). */
  messagesPartial(msgs) {
    return `<hx-partial hx-target="#messages" hx-swap="outerHTML">${messageRender.messages(msgs).value}</hx-partial>`
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
    const entitySetPath = segments.map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
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
      successMessage: req.successMessage
    })
    if (messages?.length) body = html`${rawHtml(this.messagesPartial(messages))}${body}`
    if (status) res.status(status)
    this.render(req, res, { title, body, keepMessages: !!messages?.length })
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

  /** `GET /:Set/$new`: the empty create form of a non-draft entity (FE V4 creates these directly: nothing
   *  is stored until Create). No URL of its own is pushed; Cancel returns to the List Report. */
  async newObject(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode !== 'direct' || !canCreate(edit)) return this.reject(req, res, 405, 'NotAllowed')
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys: null, segments: [{ set: req.params.Set }], contextPath: `/${req.params.Set}`, editMode: 'create'
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
    await draftLib.create(tx, childEntity.name, childDefaults)

    return this.objectPage(req, res, tx, {
      entityType: parent.name, keys: parentKeys, segments: [{ set, raw: parentRaw }], contextPath: `/${set}`
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

    if (edit.mode === 'direct') {
      return this.objectPage(req, res, tx, { entityType: entity.name, keys: plainKeys, segments: [{ set, raw }], contextPath: `/${set}`, editMode: 'direct' })
    }
    try {
      await draftLib.edit(tx, entity.name, { ...plainKeys, IsActiveEntity: true })
    } catch (err) {
      if ((err.status ?? err.statusCode ?? err.code) !== 409) throw err
      const lock = await tx.run(SELECT.one.from(entity.name).columns('DraftAdministrativeData.InProcessByUser as user').where({ ...plainKeys, IsActiveEntity: false })).catch(() => null)
      if (lock && lock.user !== cds.context.user.id) {
        return this.reject(req, res, 409, 'LockedBy', lock.user)
      }
      // your own draft: resume it
    }
    const draftKeys = { ...plainKeys, IsActiveEntity: false }
    const draftRaw = keysLib.formatKeys(draftKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${draftRaw})`)
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
    try {
      await draftLib.patch(tx, entity.name, keys, { [path]: value })
    } catch (err) {
      if (!HtmxAdapter.isUserError(err)) throw err
      return res.status(422).type('html').send(this.messagesPartial(HtmxAdapter.messagesOf(err)))
    }
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys, contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath: `${set}(${raw})` }
    const header = req.headers['x-hf-source']
    const source = typeof header === 'string' && /^[\w-]+$/.test(header) ? header : null
    const parts = await engine.bindingParts(tx, view, { path, source, ...this.appOpts(req) })
      .catch(err => { console.error('[htmx] binding refresh for', path, 'failed:', err.message); return [] })
    // clears a stale validation message of this field as well
    const markup = `${this.messagesPartial([])}${parts.length ? '\n' + engine.partialsMarkup(parts) : ''}`
    res.status(200).type('html').send(markup)
    // The response is out; annotated side effects are pushed over SSE inside this same transaction, so they see the patch
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
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
      await draftLib.save(tx, entity.name, keys)
      const activeKeys = { ...keys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      req.successMessage = this.text(req, 'ObjectSaved')
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    if (edit.mode !== 'direct') return this.reject(req, res, 405, 'NotAllowed')

    const creating = raw == null
    const keys = creating ? null : keysLib.parseKeys(raw)
    if (creating ? !canCreate(edit) : false) return this.reject(req, res, 405, 'NotAllowed')
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), entity.name, `/${set}`, this.appOpts(req))
    const current = keys && await tx.run(SELECT.one.from(entity.name).where(keys))
    if (keys && !current) return res.sendStatus(404)
    if (keys && !canEdit(edit, current)) return this.reject(req, res, 405, 'NotAllowed')
    const editMode = creating ? 'create' : 'direct'
    const segments = [{ set, raw }]
    const contextPath = `/${set}`
    let values = {}
    try {
      values = formValues(cds.model, entity.name, layout, req.body, { editMode, row: current || {} })
      if (creating) {
        // keys the service would otherwise generate are needed to show the new object
        for (const key of keyElements(entityDef(cds.model, entity.name))) {
          if (key.type === 'cds.UUID' && values[key.name] == null) values[key.name] = cds.utils.uuid()
        }
        await tx.run(INSERT.into(entity.name).entries(values))
      } else {
        await tx.run(UPDATE(entity.name).set(values).where(keys))
      }
    } catch (err) {
      if (!HtmxAdapter.isUserError(err)) throw err
      return this.objectPage(req, res, tx, { entityType: entity.name, keys, segments, contextPath, editMode, overrides: values, messages: HtmxAdapter.messagesOf(err), status: 422 })
    }
    req.successMessage = this.text(req, creating ? 'ObjectCreated' : 'ObjectSaved')
    if (!creating) return this.objectPage(req, res, tx, { entityType: entity.name, keys, segments, contextPath })
    const newKeys = Object.fromEntries(keyElements(entityDef(cds.model, entity.name)).map(k => [k.name, values[k.name]]))
    const newRaw = keysLib.formatKeys(newKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${newRaw})`)
    return this.objectPage(req, res, tx, { entityType: entity.name, keys: newKeys, segments: [{ set, raw: newRaw }], contextPath })
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
    if (edit.mode === 'direct') {
      if (raw == null) {
        res.set('HX-Push-Url', `${this.basePath(req)}/${set}`)
        req.params.Set = set
        return this.listReport(req, res, tx)
      }
      return this.objectPage(req, res, tx, { entityType: entity.name, keys: keysLib.parseKeys(raw), segments: [{ set, raw }], contextPath: `/${set}` })
    }
    if (edit.mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
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
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}`)
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
    const toasted = req.successMessage
      ? html`<hx-partial hx-target="#toast" hx-swap="outerHTML">${toastRender.toast(req.successMessage)}</hx-partial>${body}`
      : body
    this.render(req, res, { title: lrLayout.header.typeNamePlural, body: toasted })
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
    // Go/sort keep the filter state in the (replaced, not pushed) URL, so Back from an object lands on the same list
    if (!req.query.$skip) {
      const params = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => v !== '' && !(k === 'f.EditingStatus' && v === 'ALL')))
      res.set('HX-Replace-Url', `${base}/${req.params.Set}${params.size ? '?' + params : ''}`)
    }
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

  /** Every page replaces `#app`; the message strips live outside it, so a page without messages of its own
   *  clears the previous page's (`keepMessages`: the page brings its own). */
  render(req, res, { title, body, keepMessages }) {
    if (this.isFragmentRequest(req) || req.htmxApp) {
      const clear = keepMessages ? '' : this.messagesPartial([])
      res.set('Content-Type', 'text/html').send(String(layout.fragment({ title, body: html`${rawHtml(clear)}${body}` })))
    } else {
      const clientId = channels.newClientId()
      channels.rememberView(clientId, req.hfView)
      res.set('Content-Type', 'text/html').send(String(layout.page({ title, clientId, basePath: this.basePath(req), assetBase: req.htmxBase || '', body })))
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
    if (!entity || !channels.get(req.body?.client)) return res.sendStatus(404)
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
    req.on('close', () => channels.remove(clientId))
  }
}

module.exports = HtmxAdapter
