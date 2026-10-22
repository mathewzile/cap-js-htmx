const { parseAnnotationXml } = require('../annotations/xml')
const { scanManifest } = require('../annotations/manifest')
const { parseProperties } = require('../i18n')
const { config } = require('../config')
const { AppError } = require('./errors')

/** Only declarative file types are ever read from an app (design doc §3): never JS. */
const ALLOWED_EXT = /\.(json|xml|properties|html)$/
/** Relative path segments `[\w.@-]` joined by `/`: no `..`, no absolute paths, no URLs. */
const SAFE_REL = /^(?!.*(^|\/)\.\.?(\/|$))[\w.@-]+(\/[\w.@-]+)*$/

function checkRel(rel) {
  if (typeof rel !== 'string' || !SAFE_REL.test(rel) || !ALLOWED_EXT.test(rel)) {
    throw new AppError(502, `App file not allowed: ${JSON.stringify(rel)}`)
  }
  return rel
}

/** One loaded frontend app: its FE-style manifest plus the declarative files the manifest names,
 *  held in memory. Everything the backend derives from it (annotation layers, page settings,
 *  texts) is computed lazily per service path / locale and cached on the instance, so evicting
 *  the app from the registry drops those caches with it. */
class App {
  constructor({ id, version, etag, manifest, files, readFile, i18nRel }) {
    this.id = id
    this.version = version
    this.etag = etag
    this.ref = `${id}@${version}`
    this.manifest = manifest
    this.files = files
    this.readFile = readFile
    this.i18nRel = i18nRel
    this.scans = new Map() // servicePath -> { layers, listReports, objectPages }
    this.bundles = new Map() // locale -> flat texts
    this.mergedBundles = new Map() // locale -> plugin chrome + model texts + this app's texts (model/cache.js)
    this.loadedLocales = new Set()
    this.caches = new WeakMap() // cds model -> { stores, layouts }; see model/cache.js
  }

  /** What this app says about the service at `servicePath`: parsed annotation layers (manifest
   *  order) and FE page settings. Empty when the app has no data source for that service. */
  scanFor(servicePath) {
    let scan = this.scans.get(servicePath)
    if (!scan) {
      const found = scanManifest(this.manifest, servicePath)
      scan = {
        layers: (found?.annotationUris || []).map(uri => parseAnnotationXml(this.files.get(uri)).$Annotations),
        listReports: found?.listReports || {},
        objectPages: found?.objectPages || {},
        fcl: found?.fcl,
        animations: found?.animations !== false
      }
      this.scans.set(servicePath, scan)
    }
    return scan
  }

  /** Loads the `i18n_<lang>.properties` variants for a locale (the base file is loaded with the
   *  app). Missing variants are fine: a locale chain is only a preference. */
  async ensureLocale(locale) {
    if (!locale || this.loadedLocales.has(locale)) return
    this.loadedLocales.add(locale)
    const parts = locale.split(/[-_]/)
    const stem = this.i18nRel.replace(/\.properties$/, '')
    for (let i = 1; i <= parts.length; i++) {
      const rel = `${stem}_${parts.slice(0, i).join('_')}.properties`
      try {
        checkRel(rel)
        const text = await this.readFile(rel)
        if (text != null) this.files.set(rel, text)
      } catch { /* optional file */ }
    }
    this.bundles.delete(locale)
    this.mergedBundles.delete(locale)
  }

  /** The app's own texts for a locale: base first, then each more specific variant. */
  bundle(locale) {
    let bundle = this.bundles.get(locale || '')
    if (!bundle) {
      bundle = {}
      const stem = this.i18nRel.replace(/\.properties$/, '')
      const chain = [this.i18nRel]
      const parts = (locale || '').split(/[-_]/).filter(Boolean)
      for (let i = 1; i <= parts.length; i++) chain.push(`${stem}_${parts.slice(0, i).join('_')}.properties`)
      for (const rel of chain) if (this.files.has(rel)) Object.assign(bundle, parseProperties(this.files.get(rel)))
      this.bundles.set(locale || '', bundle)
    }
    return bundle
  }
}

/** Reads the manifest's own file list through the source (no directory listing needed): every
 *  `ODataAnnotation` `localUri`, the app's i18n base file and the declared `sap.htmx.fragments`.
 *  Enforces the size and file-type limits. A declared annotation file that is missing is an
 *  error: rendering a silently different layout would be worse than a clear 502. */
async function loadBundle(resolved, appId) {
  const { manifest, etag, readFile } = resolved
  const sapApp = manifest['sap.app']
  if (sapApp?.id !== appId) throw new AppError(502, `manifest.json id '${sapApp?.id}' does not match app '${appId}'`)
  const { maxBundleBytes } = config().apps

  const files = new Map()
  let bytes = 0
  const load = async (rel, { required }) => {
    checkRel(rel)
    if (files.has(rel)) return
    const text = await readFile(rel)
    if (text == null) {
      if (required) throw new AppError(502, `App '${appId}' declares ${rel} but it was not found`)
      return
    }
    bytes += Buffer.byteLength(text)
    if (bytes > maxBundleBytes) throw new AppError(502, `App '${appId}' exceeds ${maxBundleBytes} bytes`)
    files.set(rel, text)
  }

  for (const ds of Object.values(sapApp.dataSources || {})) {
    if (ds.type === 'ODataAnnotation' && ds.settings?.localUri) await load(ds.settings.localUri, { required: true })
  }
  const i18nRel = typeof sapApp.i18n === 'string' ? sapApp.i18n : 'i18n/i18n.properties'
  await load(i18nRel, { required: false })
  for (const rel of manifest['sap.htmx']?.fragments || []) await load(rel, { required: true })

  return new App({
    id: appId, version: sapApp.applicationVersion?.version || '0.0.0', etag, manifest, files, readFile, i18nRel
  })
}

module.exports = { loadBundle, App, checkRel }
