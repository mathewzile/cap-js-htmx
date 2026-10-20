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
  requireHxRequestForMutations: true
}

function config() {
  return { ...DEFAULTS, ...cds.env.htmx, sse: { ...DEFAULTS.sse, ...cds.env.htmx?.sse } }
}

/** The project's `app/` folder (manifest.json / annotation.xml / `_i18n` live here, §3.1/§3.2b),
 *  resolved from `cds.root` the same way CAP itself resolves `cds.env.folders.app`. */
function appRoot() {
  return path.join(cds.root, cds.env.folders?.app || 'app')
}

module.exports = { DEFAULTS, config, appRoot }
