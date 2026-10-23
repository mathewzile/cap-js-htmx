const { build } = require('../annotations/store')
const { standaloneApp } = require('../apps/standalone')
const { buildListReport } = require('./list-report')
const { buildObjectPage } = require('./object-page')
const i18n = require('../i18n')

/** Caches for the layered `AnnotationStore` and the `LRLayout`/`OPLayout` built from it
 *  (§3.1/§3.2: "cache per `cds.model` instance and invalidate on `cds watch` reload"). Keying on
 *  the model object itself means a `cds watch` reload -- a brand-new model instance --
 *  invalidates everything for free, with no explicit eviction logic needed.
 *
 *  The caches live ON the app that serves the request: a pulled app (design doc §2), so a new app
 *  version starts clean and an evicted one takes its caches with it, or the standalone app of the
 *  `app/` folder (a request without `X-Htmx-App`). */
const appOf = ({ appRoot, app } = {}) => app || standaloneApp(appRoot)

/** Stores and layouts are cached per locale, and the locale comes from the browser's `Accept-Language`: the number of entries
 *  is bounded (the oldest goes first) so a client that sends many different locales cannot grow the memory. */
const MAX_ENTRIES = 200
function remember(map, key, value) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value)
  map.set(key, value)
  return value
}

function cachesFor(model, app) {
  let caches = app.caches.get(model)
  if (!caches) app.caches.set(model, caches = { stores: new Map(), layouts: new Map() })
  return caches
}

/** Page settings (`ListReport`/`ObjectPage` routing-target settings, column layout, motion) for a service. */
function manifestScanFor(appRoot, servicePath, app) {
  return appOf({ appRoot, app }).scanFor(servicePath)
}

/** The Flexible Column Layout an entity set opens in (`{ two, three }`: the default layout types), or `undefined` when
 *  no app of the service runs in one for that set (`set` is the root entity set of the page). */
function fclFor(servicePath, set, { appRoot, app } = {}) {
  const fcl = manifestScanFor(appRoot, servicePath, app).fcl
  return fcl?.roots.includes(`/${set}`) ? fcl.layouts : undefined
}

/** How pages move (column layout, fades): `full`, `fast` or `none`, from `sap.htmx.animations` of the apps of the service. */
function animationsFor(servicePath, { appRoot, app } = {}) {
  return manifestScanFor(appRoot, servicePath, app).animations ?? 'full'
}

function storeFor(model, service, servicePath, { appRoot, locale, app } = {}) {
  const { stores } = cachesFor(model, appOf({ appRoot, app }))
  const key = `${service}:${locale || ''}`
  let store = stores.get(key)
  if (!store) store = remember(stores, key, build(model, service, servicePath, { appRoot, locale, app }))
  return store
}

/** UI texts for a request: the plugin chrome and the CDS model's bundle, with the app's own
 *  texts (if any) on top. */
function bundleFor({ appRoot, locale, app } = {}) {
  const base = i18n.bundleFor(appRoot, locale)
  if (!app) return base
  const key = locale || ''
  let merged = app.mergedBundles.get(key)
  if (!merged) app.mergedBundles.set(key, merged = { ...base, ...app.bundle(locale) })
  return merged
}

/** `entityType` is the full `$Annotations`-style type (`CatalogService.Books`); `contextPath`
 *  is the FE-manifest-style lookup key for that entity's page settings (`/Books`, `/Books/chapters`). */
function listReportFor(model, service, servicePath, entityType, contextPath, { appRoot, locale, app } = {}) {
  const { layouts } = cachesFor(model, appOf({ appRoot, app }))
  const key = `LR:${contextPath}:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale, app })
    const scan = manifestScanFor(appRoot, servicePath, app)
    const built = buildListReport(store, entityType, { pageSettings: scan.listReports[contextPath] })
    layout = i18n.translate(built, bundleFor({ appRoot, locale, app }))
    remember(layouts, key, layout)
  }
  return layout
}

function objectPageFor(model, service, servicePath, entityType, contextPath, { appRoot, locale, app } = {}) {
  const { layouts } = cachesFor(model, appOf({ appRoot, app }))
  const key = `OP:${contextPath}:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale, app })
    const scan = manifestScanFor(appRoot, servicePath, app)
    const built = buildObjectPage(model, store, entityType, { pageSettings: scan.objectPages[contextPath] })
    layout = i18n.translate(built, bundleFor({ appRoot, locale, app }))
    remember(layouts, key, layout)
  }
  return layout
}

module.exports = { animationsFor, fclFor, storeFor, manifestScanFor, listReportFor, objectPageFor, bundleFor }
