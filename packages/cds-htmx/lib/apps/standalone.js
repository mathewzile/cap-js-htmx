const { scanService } = require('../annotations/manifest')
const { parseAnnotationXmlFile } = require('../annotations/xml')

/** The app of a request that names none (no `X-Htmx-App`): the Fiori elements apps found under `root`, the project's `app/`
 *  folder, seen as one app. It has the interface of a pulled `App` (`caches`, `scanFor`), so the store and the layout caches
 *  have a single path: the annotation files are parsed once per service, not once per store, and the caches go with the
 *  instance. Without a `root` it is an app that says nothing: the store is just the service's own annotations. */
class StandaloneApp {
  constructor(root) {
    this.root = root
    this.caches = new WeakMap() // cds model -> { stores, layouts }; see model/cache.js
    this.scans = new Map() // servicePath -> { layers, listReports, objectPages, fcl, animations }
  }

  scanFor(servicePath) {
    let scan = this.scans.get(servicePath)
    if (!scan) {
      const found = this.root ? scanService(this.root, servicePath) : { annotationFiles: [], listReports: {}, objectPages: {}, animations: 'full' }
      scan = {
        layers: found.annotationFiles.map(file => parseAnnotationXmlFile(file).$Annotations),
        listReports: found.listReports,
        objectPages: found.objectPages,
        fcl: found.fcl,
        animations: found.animations
      }
      this.scans.set(servicePath, scan)
    }
    return scan
  }
}

const instances = new Map() // root -> StandaloneApp

/** The standalone app for `root` (one per root, so its caches are shared by all requests). */
function standaloneApp(root) {
  const key = root || ''
  let app = instances.get(key)
  if (!app) instances.set(key, app = new StandaloneApp(root))
  return app
}

module.exports = { standaloneApp, StandaloneApp }
