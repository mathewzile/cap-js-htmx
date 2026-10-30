const cds = require('@sap/cds')
const path = require('node:path')

/** The themes the plugin ships (Horizon, as in the Work Zone), and `auto`: light or dark as the browser prefers. */
const THEMES = ['sap_horizon', 'sap_horizon_dark', 'sap_horizon_hcb', 'sap_horizon_hcw']

const DEFAULTS = {
  theme: 'sap_horizon',
  treeChildrenPage: 100, // children of a tree node read per request (a `More` row asks for the next page)
  sse: { heartbeat: 15000 },
  liveListReport: true,
  serverTiming: true, // answers carry a `Server-Timing` header: the database statements and the time spent in this service
  requireHxRequestForMutations: true,
  stickySessions: true, // cookie name, or true for JSESSIONID (what Cloud Foundry's router keys on), or false
  apps: { sources: [{ kind: 'local' }], allow: ['*'], ttl: 60000, refetchInterval: 5000, localRecheck: 1000, maxApps: 50, maxBundleBytes: 2097152, fetchTimeout: 5000 }
}

function config() {
  const env = cds.env.htmx
  const merged = { ...DEFAULTS, ...env, sse: { ...DEFAULTS.sse, ...env?.sse }, apps: { ...DEFAULTS.apps, ...env?.apps } }
  if (merged.theme !== 'auto' && !THEMES.includes(merged.theme)) merged.theme = DEFAULTS.theme // an unknown name must not leave a page unstyled
  return merged
}

/** The project's `app/` folder (manifest.json / annotation.xml / `_i18n` live here, §3.1/§3.2b),
 *  resolved from `cds.root` the same way CAP itself resolves `cds.env.folders.app`. */
function appRoot() {
  return path.join(cds.root, cds.env.folders?.app || 'app')
}

module.exports = { DEFAULTS, THEMES, config, appRoot }
