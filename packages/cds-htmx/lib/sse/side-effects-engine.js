const cds = require('@sap/cds')
const channels = require('./channels')
const { write } = require('./stream')
const cache = require('../model/cache')
const { buildSideEffects } = require('../model/side-effects')
const { loadObjectPage } = require('../data/page')
const { invokeAction } = require('../data/actions')
const { selectColumns, markDraftOwners } = require('../data/query')
const objectPageRender = require('../render/object-page')
const { rowMarkup, rowId, isNumericColumn } = require('../render/table')
const i18n = require('../i18n')
const { config, appRoot } = require('../config')
const { keyElements, entityDef } = require('../annotations/edm')

/** Side-effect target lists mix plain strings (CAP-compiled) and `{$PropertyPath}`/`{$NavigationPropertyPath}`
 *  wrappers (hand-written XML layers); both normalise to the path string. */
function targetName(t) {
  if (typeof t === 'string') return t
  return t?.$PropertyPath ?? t?.$NavigationPropertyPath ?? t?.$Path ?? ''
}

const WILDCARDS = new Set(['', '*'])

/** Union of what a set of `Common.SideEffects` asks to re-render (§4.2.1):
 *  `all` (wildcard target), the property paths, and the navigation (table section) names.
 *  `DraftMessages` is the message popover's own channel, not a field, and is skipped here. */
function collectTargets(effects) {
  const targets = { all: false, properties: new Set(), entities: new Set() }
  for (const effect of effects) {
    for (const t of (effect.TargetProperties || []).map(targetName)) {
      if (WILDCARDS.has(t)) targets.all = true
      else if (t !== 'DraftMessages') targets.properties.add(t)
    }
    for (const t of (effect.TargetEntities || []).map(targetName)) {
      if (WILDCARDS.has(t)) targets.all = true
      else targets.entities.add(t)
    }
  }
  return targets
}

const isEmpty = targets => !targets.all && !targets.properties.size && !targets.entities.size

const indexCache = new WeakMap() // store -> Map(entityType -> buildSideEffects())
function sideEffectsOf(store, entityType) {
  let perStore = indexCache.get(store)
  if (!perStore) indexCache.set(store, perStore = new Map())
  if (!perStore.has(entityType)) perStore.set(entityType, buildSideEffects(store, entityType))
  return perStore.get(entityType)
}

/** Does a page of this entity ever receive pushed events? Only then does the browser open a stream
 *  (§4.1): an Object Page when the entity has any `Common.SideEffects` (edits in a draft, `SourceEvents`),
 *  a List Report when it is live and some side effect has `SourceEvents`. */
function needsStream(store, entityType, { list = false } = {}) {
  const index = sideEffectsOf(store, entityType)
  if (list) return config().liveListReport && index.byEvent.size > 0
  return index.byProperty.size > 0 || index.byNavigation.size > 0 || index.byEvent.size > 0
}

/** OData and htmx endpoint paths of a service (FE manifests and `cds.compile.to.edm()` are keyed to
 *  the OData path, §3.1; links and the SSE view tracking use the htmx one). */
function servicePaths(srv) {
  const slash = p => p.replace(/\/?$/, '/')
  const odata = srv.endpoints?.find(e => e.kind === 'odata' || e.kind === 'odata-v4')
  const htmx = srv.endpoints?.find(e => e.kind === 'htmx')
  return { odata: odata ? slash(odata.path) : htmx ? slash(htmx.path) : '/', htmx: htmx?.path }
}

/** Wraps each DOM update as an `<hx-partial>` and sends them as ONE unnamed SSE message, which
 *  the `hx-sse` extension swaps (htmx processes partials independently of the connecting element's
 *  `hx-swap="none"`), followed by the named `htmx:fe:sideEffects` DOM event for client hooks. */
function partialsMarkup(parts) {
  return parts
    .map(p => `<hx-partial hx-target="${p.target}" hx-swap="${p.swap}">${String(p.html)}</hx-partial>`)
    .join('\n')
}

function publish(client, parts) {
  if (!parts.length || client.res.writableEnded) return
  write(client.res, { data: partialsMarkup(parts) })
  write(client.res, { event: 'htmx:fe:sideEffects', data: JSON.stringify({ targets: parts.map(p => p.target) }) })
}

/** Re-reads one object and publishes the parts `targets` asks for to one client. `tx` decides
 *  the data visibility: the request's own transaction (field change) or one opened for the
 *  client's user (server-triggered events). */
async function pushObjectPage(tx, client, view, targets) {
  const { service, servicePath, entityType, keys, contextPath, basePath, entitySetPath } = view
  const locale = client.locale
  const page = await loadObjectPage(tx, { service, servicePath, entityType, keys, contextPath, appRoot: appRoot(), locale, app: view.app })
  if (!page) return
  const ctx = {
    basePath, entitySetPath, bundle: page.bundle, t: i18n.t,
    valueLists: page.valueLists, children: page.children, trail: []
  }
  publish(client, objectPageRender.sideEffectParts(page.layout, page.row, ctx, {
    all: targets.all, properties: [...targets.properties], entities: [...targets.entities]
  }))
}

/** The other places a just-edited draft value is shown (FE binds every control to the same model
 *  property): the header title/description, other facets showing the property, data points.
 *  Returned with the PATCH response itself, so the page never depends on SSE for it. `source` is the
 *  edited field's own element id, left alone so the caret and focus stay where the user is typing.
 *  Also returns the layout and the fresh row, for validating the value. */
async function bindingParts(tx, view, { path, source, appRoot: root, locale, app }) {
  const page = await loadObjectPage(tx, { service: view.service, servicePath: view.servicePath, entityType: view.entityType, keys: view.keys, contextPath: view.contextPath, appRoot: root, locale, app, editing: true })
  if (!page) return { parts: [], layout: null, row: null }
  const ctx = { basePath: view.basePath, entitySetPath: view.entitySetPath, bundle: page.bundle, t: i18n.t, valueLists: page.valueLists, children: page.children, trail: [] }
  const parts = objectPageRender.sideEffectParts(page.layout, page.row, ctx, { properties: [path], exclude: source ? ['#' + source] : [] })
  return { parts, layout: page.layout, row: page.row }
}

/** A change inside an Object Page in edit mode (§4.2.1): `properties` the user edited and/or
 *  `navigations` (table sections) whose rows changed. Resolves the matching side effects, runs any
 *  `TriggerAction` on the draft first, then pushes the re-rendered targets to the editing client.
 *  FE only fires side effects for drafts, so active-entity changes are ignored (§4.2.4). */
async function onChange(tx, view, { clientId, properties = [], navigations = [] }) {
  const client = channels.get(clientId)
  if (!client || view.keys.IsActiveEntity !== false) return
  const store = cache.storeFor(cds.model, view.service, view.servicePath, { appRoot: appRoot(), locale: client.locale, app: view.app })
  const index = sideEffectsOf(store, view.entityType)
  const effects = new Set()
  for (const p of properties) for (const e of index.byProperty.get(p) || []) effects.add(e)
  for (const n of navigations) for (const e of index.byNavigation.get(n) || []) effects.add(e)
  if (!effects.size) return

  for (const effect of effects) {
    const action = targetName(effect.TriggerAction)
    if (action) await invokeAction(tx, action, view.keys, {})
  }
  const targets = collectTargets(effects)
  if (isEmpty(targets)) return
  await pushObjectPage(tx, client, view, targets)
}

/** `Common.SideEffects` with `SourceEvents` (§4.2.3): the CAP event payload carries the entity keys;
 *  every client viewing that object (display mode) gets the targets re-rendered, and, with
 *  `liveListReport`, every client on the List Report gets the affected row refreshed. */
async function onSourceEvent(srv, { entityType, eventName, data }) {
  const { odata } = servicePaths(srv)
  const entity = entityDef(cds.model, entityType)
  const keyNames = keyElements(entity).map(k => k.name).filter(n => n !== 'IsActiveEntity')
  if (keyNames.some(n => data?.[n] == null)) return
  const keys = Object.fromEntries(keyNames.map(n => [n, data[n]]))
  const isDraftRoot = !!entity.drafts
  const sameKeys = view => keyNames.every(n => String(view.keys?.[n]) === String(keys[n]))

  for (const client of [...channels.all()]) {
    const view = client.view
    if (!view || view.entityType !== entityType) continue
    try {
      await srv.tx({ user: client.user, locale: client.locale }, async tx => {
        const store = cache.storeFor(cds.model, srv.name, odata, { appRoot: appRoot(), locale: client.locale, app: view.app })
        const effects = sideEffectsOf(store, entityType).byEvent.get(eventName) || []
        if (view.list) {
          if (!config().liveListReport) return
          await pushListRow(tx, client, { srv, servicePath: odata, entityType, view, keys: isDraftRoot ? { ...keys, IsActiveEntity: true } : keys })
        } else if (sameKeys(view) && view.keys.IsActiveEntity !== false) {
          const targets = collectTargets(effects)
          if (!isEmpty(targets)) await pushObjectPage(tx, client, { ...view, service: srv.name, servicePath: odata }, targets)
        }
      })
    } catch (err) {
      console.error('[sse] side effect for event', eventName, 'failed:', err.message)
    }
  }
}

/** Live List Report (beyond FE, §4.2.3): re-reads the one affected row with the table's own
 *  columns and swaps it in place by its stable row id. */
async function pushListRow(tx, client, { srv, servicePath, entityType, view, keys }) {
  const layout = cache.listReportFor(cds.model, srv.name, servicePath, entityType, `/${view.set}`, { appRoot: appRoot(), locale: client.locale, app: view.app })
  const row = await tx.run(SELECT.one.from(entityType).columns(selectColumns(cds.model, entityType, layout)).where(keys))
  if (!row) return
  await markDraftOwners(tx, entityType, layout, [row], client.user?.id)
  const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name)
  const numeric = layout.table.columns.map(col => isNumericColumn(col, [row]))
  publish(client, [{
    target: '#' + rowId(keyNames, row), swap: 'outerMorph',
    html: rowMarkup(layout, row, { basePath: view.basePath, entitySetPath: view.set, keyNames, bundle: cache.bundleFor({ appRoot: appRoot(), locale: client.locale, app: view.app }), t: i18n.t, numeric, selectable: true })
  }])
}

/** Registers `srv.on(<event>)` for every event named as a `SourceEvents` of some entity's
 *  `Common.SideEffects` (§4.2.3). Runs once per `@htmx` service from `cds-plugin.js`. */
function registerSourceEvents(srv) {
  const { odata } = servicePaths(srv)
  const store = cache.storeFor(cds.model, srv.name, odata, { appRoot: appRoot() })
  const wanted = new Map() // event name -> [entityType]
  for (const entity of Object.values(srv.entities)) {
    if (!entity.name || entity.name.endsWith('.drafts')) continue
    for (const eventName of sideEffectsOf(store, entity.name).byEvent.keys()) {
      if (!wanted.has(eventName)) wanted.set(eventName, [])
      wanted.get(eventName).push(entity.name)
    }
  }
  for (const [eventName, entityTypes] of wanted) {
    srv.on(eventName, async (msg, next) => {
      // Defer until the emitting transaction finished, so the re-read sees its committed changes
      const run = () => Promise.all(entityTypes.map(entityType => onSourceEvent(srv, { entityType, eventName, data: msg.data })))
        .catch(err => console.error('[sse] SourceEvents', eventName, 'failed:', err.message))
      const ctx = cds.context
      if (typeof ctx?.on === 'function') ctx.on('succeeded', run)
      else setImmediate(run)
      return next()
    })
  }
}

module.exports = { needsStream, registerSourceEvents, onChange, onSourceEvent, bindingParts, partialsMarkup, collectTargets, servicePaths, publish }
