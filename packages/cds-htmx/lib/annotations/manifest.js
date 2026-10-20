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

/** Scans every FE app manifest for the one(s) whose `sap.app.dataSources` OData entry points at
 *  `servicePath` (e.g. `/odata/v4/catalog/`), and returns:
 *   - `annotationFiles`: absolute paths to that app's local `ODataAnnotation` XML files, in the
 *     order `mainService.settings.annotations` lists them (later files layer over earlier ones
 *     and over the compiled service annotations, per FE's own merge order)
 *   - `listReports`/`objectPages`: `sap.fe.templates.ListReport`/`ObjectPage` routing-target
 *     `options.settings`, keyed by `contextPath` (e.g. `/Books`, `/Books/chapters` for a sub-OP)
 *  Used so the layout builders can honor manifest page settings (§3.2b) when an FE app exists,
 *  falling back to `fe-defaults.js` otherwise. */
function scanService(appRoot, servicePath) {
  const result = { annotationFiles: [], listReports: {}, objectPages: {} }
  for (const manifestPath of findManifests(appRoot)) {
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }

    const dataSources = manifest['sap.app']?.dataSources || {}
    const mainEntry = Object.entries(dataSources)
      .find(([, ds]) => ds.type === 'OData' && normalize(ds.uri) === normalize(servicePath))
    if (!mainEntry) continue

    const [, mainDs] = mainEntry
    const webappDir = path.dirname(manifestPath)
    for (const key of mainDs.settings?.annotations || []) {
      const annDs = dataSources[key]
      if (annDs?.type === 'ODataAnnotation' && annDs.settings?.localUri) {
        result.annotationFiles.push(path.join(webappDir, annDs.settings.localUri))
      }
    }

    const targets = manifest['sap.ui5']?.routing?.targets || {}
    for (const target of Object.values(targets)) {
      const settings = target.options?.settings
      if (!settings?.contextPath) continue
      if (target.name === 'sap.fe.templates.ListReport') result.listReports[settings.contextPath] = settings
      else if (target.name === 'sap.fe.templates.ObjectPage') result.objectPages[settings.contextPath] = settings
    }
  }
  return result
}

module.exports = { findManifests, scanService }
