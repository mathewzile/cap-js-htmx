const { build } = require('../annotations/store')
const { scanService } = require('../annotations/manifest')
const { buildListReport } = require('./list-report')
const { buildObjectPage } = require('./object-page')
const i18n = require('../i18n')

/** Per-`cds.model` cache of the layered `AnnotationStore` and the `LRLayout`/`OPLayout` built
 *  from it (§3.1/§3.2: "cache per `cds.model` instance and invalidate on `cds watch` reload").
 *  Keying on the model object itself means a `cds watch` reload -- a brand-new model instance --
 *  invalidates everything for free, with no explicit eviction logic needed. */
const storeCache = new WeakMap() // model -> Map(`${service}:${locale}` -> AnnotationStore)
const manifestCache = new Map() // `${appRoot}:${servicePath}` -> scanService() result
const layoutCache = new WeakMap() // model -> Map(`${kind}:${entityType}:${locale}` -> layout)

function manifestScanFor(appRoot, servicePath) {
  if (!appRoot) return { annotationFiles: [], listReports: {}, objectPages: {} }
  const key = `${appRoot}:${servicePath}`
  let scan = manifestCache.get(key)
  if (!scan) manifestCache.set(key, scan = scanService(appRoot, servicePath))
  return scan
}

function storeFor(model, service, servicePath, { appRoot, locale } = {}) {
  let perModel = storeCache.get(model)
  if (!perModel) storeCache.set(model, perModel = new Map())
  const key = `${service}:${locale || ''}`
  let store = perModel.get(key)
  if (!store) perModel.set(key, store = build(model, service, servicePath, { appRoot, locale }))
  return store
}

function layoutsFor(model) {
  let perModel = layoutCache.get(model)
  if (!perModel) layoutCache.set(model, perModel = new Map())
  return perModel
}

/** `entityType` is the full `$Annotations`-style type (`CatalogService.Books`); `contextPath`
 *  is the FE-manifest-style lookup key for that entity's page settings (`/Books`, `/Books/chapters`). */
function listReportFor(model, service, servicePath, entityType, contextPath, { appRoot, locale } = {}) {
  const layouts = layoutsFor(model)
  const key = `LR:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale })
    const scan = manifestScanFor(appRoot, servicePath)
    const built = buildListReport(store, entityType, { pageSettings: scan.listReports[contextPath] })
    layout = i18n.translate(built, i18n.bundleFor(appRoot, locale))
    layouts.set(key, layout)
  }
  return layout
}

function objectPageFor(model, service, servicePath, entityType, contextPath, { appRoot, locale } = {}) {
  const layouts = layoutsFor(model)
  const key = `OP:${entityType}:${locale || ''}`
  let layout = layouts.get(key)
  if (!layout) {
    const store = storeFor(model, service, servicePath, { appRoot, locale })
    const scan = manifestScanFor(appRoot, servicePath)
    const built = buildObjectPage(model, store, entityType, { pageSettings: scan.objectPages[contextPath] })
    layout = i18n.translate(built, i18n.bundleFor(appRoot, locale))
    layouts.set(key, layout)
  }
  return layout
}

module.exports = { storeFor, manifestScanFor, listReportFor, objectPageFor }
