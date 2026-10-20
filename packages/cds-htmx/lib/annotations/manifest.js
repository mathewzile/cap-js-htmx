const fs = require('node:fs')
const path = require('node:path')

/** Finds every FE app's `manifest.json` under `<appRoot>/**\/webapp/manifest.json`. No glob
 *  dependency needed: `fs.readdirSync(.., {recursive:true})` (Node 20.1+) walks the tree. */
function findManifests(appRoot) {
  if (!fs.existsSync(appRoot)) return []
  return fs.readdirSync(appRoot, { recursive: true })
    .filter(p => path.basename(p) === 'manifest.json' && path.basename(path.dirname(p)) === 'webapp')
    .map(p => path.join(appRoot, p))
}

const normalize = uri => uri.replace(/\/+$/, '')

/** What one parsed manifest says about the service at `servicePath` (e.g. `/odata/v4/catalog/`),
 *  or `null` if it has no OData data source for it:
 *   - `annotationUris`: the app's local `ODataAnnotation` files (`settings.localUri`, relative to
 *     the manifest), in the order `mainService.settings.annotations` lists them (later files layer
 *     over earlier ones and over the compiled service annotations, per FE's own merge order)
 *   - `listReports`/`objectPages`: `sap.fe.templates.ListReport`/`ObjectPage` routing-target
 *     `options.settings`, keyed by `contextPath` (e.g. `/Books`, `/Books/chapters` for a sub-OP)
 *  Pure function of the manifest, so it serves both the `app/` folder scan and pulled app bundles. */
function scanManifest(manifest, servicePath) {
  const dataSources = manifest['sap.app']?.dataSources || {}
  const mainEntry = Object.entries(dataSources)
    .find(([, ds]) => ds.type === 'OData' && normalize(ds.uri) === normalize(servicePath))
  if (!mainEntry) return null

  const result = { annotationUris: [], listReports: {}, objectPages: {} }
  for (const key of mainEntry[1].settings?.annotations || []) {
    const annDs = dataSources[key]
    if (annDs?.type === 'ODataAnnotation' && annDs.settings?.localUri) result.annotationUris.push(annDs.settings.localUri)
  }

  const targets = manifest['sap.ui5']?.routing?.targets || {}
  for (const target of Object.values(targets)) {
    const settings = target.options?.settings
    if (!settings?.contextPath) continue
    if (target.name === 'sap.fe.templates.ListReport') result.listReports[settings.contextPath] = settings
    else if (target.name === 'sap.fe.templates.ObjectPage') result.objectPages[settings.contextPath] = settings
  }
  return result
}

/** Scans every FE app manifest in the `app/` folder for the one(s) whose OData data source points
 *  at `servicePath`; `annotationFiles` are absolute paths. Used so the layout builders can honor
 *  manifest page settings (§3.2b) when an FE app exists, falling back to `fe-defaults.js` otherwise. */
function scanService(appRoot, servicePath) {
  const result = { annotationFiles: [], listReports: {}, objectPages: {} }
  for (const manifestPath of findManifests(appRoot)) {
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
    const scan = scanManifest(manifest, servicePath)
    if (!scan) continue
    const webappDir = path.dirname(manifestPath)
    for (const uri of scan.annotationUris) result.annotationFiles.push(path.join(webappDir, uri))
    Object.assign(result.listReports, scan.listReports)
    Object.assign(result.objectPages, scan.objectPages)
  }
  return result
}

module.exports = { findManifests, scanManifest, scanService }
