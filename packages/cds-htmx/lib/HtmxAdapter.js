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
const keysLib = require('./keys')
const messageRender = require('./render/messages')
const { textsFor } = require('./render/texts')
const fclRender = require('./render/fcl')
const ids = require('./render/ids')
const { InputError } = require('./data/form')
const { editCapabilities } = require('./model/edit-capabilities')
const engine = require('./sse/side-effects-engine')

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

  /** Wraps a handler so it runs inside a service transaction and errors reach the HttpAdapter error handler. */
  handle(fn) {
    const srv = this.service
    // `req.hfFailure`: a handler that wants to answer an error itself, AFTER the transaction rolled back
    // (CAP persists draft messages from the rollback of a failed activation, so the error must propagate)
    // In a Flexible Column Layout the ids of the page depend on its column (render/ids.js): the request path says which one
    const run = (req, res) => srv.tx(req, tx => fn.call(this, req, res, this.timed(req, res, tx)))
    return (req, res, next) => {
      const column = this.fclColumnOfPath(req)
      return (column == null ? run(req, res) : ids.inColumn(column, () => run(req, res))).catch(err => req.hfFailure ? req.hfFailure(err) : next(err))
    }
  }

  /** `Server-Timing: db;desc="<n> stmts";dur=<ms>, app;dur=<ms>` (browser dev tools show it under Timing), so the time of a request can
   *  be split between the database, this service and everything around it (approuter, network). `db` is the time at least one
   *  statement was in flight, statements that run together are not counted twice. The event stream is left alone. */
  timed(req, res, tx) {
    if (!config().serverTiming || req.path === '/$events') return tx
    const started = performance.now()
    let statements = 0
    let active = 0
    let since = 0
    let db = 0
    const run = tx.run
    tx.run = async function (...args) {
      statements++
      if (active++ === 0) since = performance.now()
      try { return await run.apply(this, args) } finally { if (--active === 0) db += performance.now() - since }
    }
    const writeHead = res.writeHead
    res.writeHead = function (...args) {
      res.writeHead = writeHead
      if (!res.headersSent) res.setHeader('Server-Timing', `db;desc="${statements} stmts";dur=${db.toFixed(1)}, app;dur=${(performance.now() - started).toFixed(1)}`)
      return writeHead.apply(this, args)
    }
    return tx
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

// the routes, grouped by what they do (lib/routes/*.js); they are methods of the adapter
Object.assign(HtmxAdapter.prototype, require('./routes/object'), require('./routes/draft'), require('./routes/fields'), require('./routes/list'), require('./routes/playground'))

module.exports = HtmxAdapter
