const cds = require('@sap/cds')
const path = require('node:path')

const DEFAULTS = {
  theme: 'sap_horizon',
  shell: true,
  appTitle: null,
  growingThreshold: 20,
  assets: 'local',
  sse: { heartbeat: 15000 },
  liveListReport: true,
  requireHxRequestForMutations: true,
  apps: { sources: [{ kind: 'local' }], allow: ['*'], ttl: 60000, refetchInterval: 5000, localRecheck: 1000, maxApps: 50, maxBundleBytes: 2097152, fetchTimeout: 5000 }
}

function config() {
  const env = cds.env.htmx
  return { ...DEFAULTS, ...env, sse: { ...DEFAULTS.sse, ...env?.sse }, apps: { ...DEFAULTS.apps, ...env?.apps } }
}

/** The project's `app/` folder (manifest.json / annotation.xml / `_i18n` live here, §3.1/§3.2b),
 *  resolved from `cds.root` the same way CAP itself resolves `cds.env.folders.app`. */
function appRoot() {
  return path.join(cds.root, cds.env.folders?.app || 'app')
}

module.exports = { DEFAULTS, config, appRoot }
