const { build } = require('../annotations/store')
const { scanService } = require('../annotations/manifest')
const { buildListReport } = require('./list-report')
const { buildObjectPage } = require('./object-page')
const i18n = require('../i18n')

/** Caches for the layered `AnnotationStore` and the `LRLayout`/`OPLayout` built from it
 *  (§3.1/§3.2: "cache per `cds.model` instance and invalidate on `cds watch` reload"). Keying on
 *  the model object itself means a `cds watch` reload -- a brand-new model instance --
 *  invalidates everything for free, with no explicit eviction logic needed.
 *
 *  Requests without an app share one set of caches (the `app/` folder scan). A request for a
 *  pulled app (design doc §2) uses caches that live ON that `App` instance, so a new app version
 *  starts clean and an evicted one takes its caches with it. */
const sharedCaches = new WeakMap() // model -> { stores, layouts }
const manifestCache = new Map() // `${appRoot}:${servicePath}` -> scanService() result

function cachesFor(model, app) {
  const holder = app ? app.caches : sharedCaches
  let caches = holder.get(model)
  if (!caches) holder.set(model, caches = { stores: new Map(), layouts: new Map() })
  return caches
}

/** Page settings (`ListReport`/`ObjectPage` routing-target settings) for a service: from the app
 *  when one is given, otherwise from every FE manifest in the `app/` folder. */
function manifestScanFor(appRoot, servicePath, app) {
  if (app) return app.scanFor(servicePath)
  if (!appRoot) return { annotationFiles: [], listReports: {}, objectPages: {} }
  const key = `${appRoot}:${servicePath}`
  let scan = manifestCache.get(key)
  if (!scan) manifestCache.set(key, scan = scanService(appRoot, servicePath))
  return scan
}

function storeFor(model, service, servicePath, { appRoot, locale, app } = {}) {
  const { stores } = cachesFor(model, app)
  const key = `${service}:${locale || ''}`
  let store = stores.get(key)
  if (!store) stores.set(key, store = build(model, service, servicePath, { appRoot, locale, app }))
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
  const { layouts } = cachesFor(model, app)
  const key = `LR:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale, app })
    const scan = manifestScanFor(appRoot, servicePath, app)
    const built = buildListReport(store, entityType, { pageSettings: scan.listReports[contextPath] })
    layout = i18n.translate(built, bundleFor({ appRoot, locale, app }))
    layouts.set(key, layout)
  }
  return layout
}

function objectPageFor(model, service, servicePath, entityType, contextPath, { appRoot, locale, app } = {}) {
  const { layouts } = cachesFor(model, app)
  const key = `OP:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale, app })
    const scan = manifestScanFor(appRoot, servicePath, app)
    const built = buildObjectPage(model, store, entityType, { pageSettings: scan.objectPages[contextPath] })
    layout = i18n.translate(built, bundleFor({ appRoot, locale, app }))
    layouts.set(key, layout)
  }
  return layout
}

module.exports = { storeFor, manifestScanFor, listReportFor, objectPageFor, bundleFor }
