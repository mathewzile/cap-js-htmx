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
 *   - `fcl`: `{ roots, layouts }` when the app runs in a Flexible Column Layout (FE: router class
 *     `sap.f.routing.Router`, the FCL root view or a `flexibleColumnLayout` config): `roots` are the context paths of its
 *     List Reports (the entity sets whose pages open in columns), `layouts` the default two / three column layout types
 *   - `animations`: the motion of the app, `full` (default), `fast` (durations a quarter as long) or `none` (no transitions or
 *     animations), from `sap.htmx.animations` (`true` / `false` are `full` / `none`)
 *   - routing: with `routing.routes` the manifest decides where a page can navigate to. Each List Report / Object Page
 *     target then carries `$navigation`, `{ <entity set or navigation property>: true }` for every `navigation` entry
 *     whose `detail.route` is a route of the manifest; anything else is not navigable (as in FE)
 *   - `app`: the manifest is an htmx app's (it has `sap.htmx`). The layout settings of an app (`fcl`, `animations`) belong to that app:
 *     they apply to the pages requested for it (`X-Htmx-App`, the shell), not to the standalone pages, which follow the FE manifests
 *  Pure function of the manifest, so it serves both the `app/` folder scan and pulled app bundles. */
function scanManifest(manifest, servicePath) {
  const dataSources = manifest['sap.app']?.dataSources || {}
  const mainEntry = Object.entries(dataSources)
    .find(([, ds]) => ds.type === 'OData' && normalize(ds.uri) === normalize(servicePath))
  if (!mainEntry) return null

  const result = { annotationUris: [], listReports: {}, objectPages: {}, app: !!manifest['sap.htmx'], animations: motionOf(manifest['sap.htmx']?.animations) }
  for (const key of mainEntry[1].settings?.annotations || []) {
    const annDs = dataSources[key]
    if (annDs?.type === 'ODataAnnotation' && annDs.settings?.localUri) result.annotationUris.push(annDs.settings.localUri)
  }

  const routing = manifest['sap.ui5']?.routing || {}
  const routes = Array.isArray(routing.routes) ? routing.routes : Object.values(routing.routes || {})
  const routeNames = new Set(routes.map(r => r.name))
  for (const target of Object.values(routing.targets || {})) {
    let settings = target.options?.settings
    if (!settings?.contextPath) continue
    if (routeNames.size) settings = { ...settings, $navigation: navigableOf(settings.navigation, routeNames) }
    if (target.name === 'sap.fe.templates.ListReport') result.listReports[settings.contextPath] = settings
    else if (target.name === 'sap.fe.templates.ObjectPage') result.objectPages[settings.contextPath] = settings
  }
  if (isFlexibleColumnLayout(manifest)) {
    const config = routing.config?.flexibleColumnLayout || {}
    result.fcl = {
      roots: Object.keys(result.listReports),
      layouts: { two: config.defaultTwoColumnLayoutType || 'TwoColumnsMidExpanded', three: config.defaultThreeColumnLayoutType || 'ThreeColumnsMidExpanded' }
    }
  }
  return result
}

const MOTION_RANK = { full: 0, fast: 1, none: 2 }

/** `sap.htmx.animations` as a motion mode: `true` / `full` / unset -> `full`, `false` / `none` -> `none`, `fast` -> `fast`. */
function motionOf(value) {
  if (value === false || value === 'none') return 'none'
  return value === 'fast' ? 'fast' : 'full'
}

/** The `navigation` entries of a target whose route exists: `{ Books: { detail: { route: 'BooksObjectPage' } } }` -> `{ Books: true }`. */
function navigableOf(navigation, routeNames) {
  const out = {}
  for (const [key, entry] of Object.entries(navigation || {})) {
    const route = entry?.detail?.route ?? entry?.display?.route
    if (route && routeNames.has(route)) out[key] = true
  }
  return out
}

/** FE runs an app in a Flexible Column Layout when its router is the `sap.f` one, its root view is the FCL container
 *  or the routing config has a `flexibleColumnLayout` section. */
function isFlexibleColumnLayout(manifest) {
  const ui5 = manifest['sap.ui5'] || {}
  return ui5.routing?.config?.routerClass === 'sap.f.routing.Router'
    || /\.Fcl$/.test(ui5.rootView?.viewName || '')
    || !!ui5.routing?.config?.flexibleColumnLayout
}

/** Scans every FE app manifest in the `app/` folder for the one(s) whose OData data source points
 *  at `servicePath`; `annotationFiles` are absolute paths. Used so the layout builders can honor
 *  manifest page settings (§3.2b) when an FE app exists, falling back to `fe-defaults.js` otherwise. */
function scanService(appRoot, servicePath) {
  const result = { annotationFiles: [], listReports: {}, objectPages: {}, fcl: undefined, animations: 'full' }
  for (const manifestPath of findManifests(appRoot)) {
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
    const scan = scanManifest(manifest, servicePath)
    if (!scan) continue
    const webappDir = path.dirname(manifestPath)
    for (const uri of scan.annotationUris) result.annotationFiles.push(path.join(webappDir, uri))
    Object.assign(result.listReports, scan.listReports)
    Object.assign(result.objectPages, scan.objectPages)
    if (scan.app) continue // the settings of an htmx app are the app's own (see `app` above)
    if (MOTION_RANK[scan.animations] > MOTION_RANK[result.animations]) result.animations = scan.animations // several manifests: the calmest wins
    if (scan.fcl) result.fcl = { roots: [...(result.fcl?.roots || []), ...scan.fcl.roots], layouts: scan.fcl.layouts }
  }
  return result
}

module.exports = { findManifests, scanManifest, scanService, motionOf }
