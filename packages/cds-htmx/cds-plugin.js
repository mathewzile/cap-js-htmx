const cds = require('@sap/cds')
const assets = require('./lib/assets')
const channels = require('./lib/sse/channels')

cds.once('bootstrap', app => {
  // before the asset router: the rewrite of a project's `/<name>/webapp/htmx/...` has to see the asset requests too
  if (!cds.env.production) mountShell(app)
  app.use(assets.mountPath, assets.router)
})

/** Development only: an htmx frontend project (`app/<name>/webapp` with `sap.htmx` in its manifest) loads the generic shell
 *  from its own `shell/` folder, which only the build of `cds-htmx-shell` puts there. Served from the shell package instead,
 *  so the project's source URL (`/<name>/webapp/index.html`) works without a build. */
function mountShell(app) {
  const path = require('node:path')
  const fs = require('node:fs')
  const express = require('express')
  const { appRoot } = require('./lib/config')
  const { findManifests } = require('./lib/annotations/manifest')
  let shellDir
  try { shellDir = path.join(path.dirname(require.resolve('cds-htmx-shell/package.json')), 'shell') } catch { return }
  if (!fs.existsSync(shellDir)) return
  const root = appRoot()
  for (const manifestPath of findManifests(root)) {
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
    if (!manifest['sap.htmx'] || fs.existsSync(path.join(path.dirname(manifestPath), 'shell'))) continue
    const url = '/' + path.relative(root, path.dirname(manifestPath)).split(path.sep).join('/') + '/shell'
    app.use(url, express.static(shellDir))
    // The shell asks for everything under the URL the page is served from (behind an approuter that prefix is the app's), so
    // `/<name>/webapp/htmx/...` is the plugin's `/htmx/...`
    const prefix = url.replace(/shell$/, 'htmx/')
    app.use((req, _res, next) => {
      if (req.url.startsWith(prefix)) req.url = '/htmx/' + req.url.slice(prefix.length)
      next()
    })
  }
}

cds.on('serving', srv => {
  if (!srv.endpoints?.some(e => e.kind === 'htmx')) return
  const { registerSourceEvents } = require('./lib/sse/side-effects-engine')
  registerSourceEvents(srv)
})

cds.on('shutdown', () => channels.closeAll())
