// The Genres list as a tree table, through the manifest of the fixture app `fixtures/apps/genres-tree` (the sample apps have no such app).
// Require it BEFORE `@sap/cds`: it registers the fixture apps as a source, and cds reads its configuration when it loads.
const path = require('node:path')

const APPS = path.join(__dirname, '..', 'fixtures', 'apps')
process.env.CDS_HTMX_APPS_SOURCES = JSON.stringify([{ kind: 'local' }, { kind: 'local', root: APPS }])

module.exports = {
  /** the folder of the fixture apps: the `appRoot` of a layout built for them */
  APPS,
  /** a request without X-Htmx-App only sees the sample apps of the project, so the Genres pages are requested for the fixture app */
  withApp: headers => ({ ...headers, 'X-Htmx-App': 'fixture.genrestree@1.0.0' })
}
