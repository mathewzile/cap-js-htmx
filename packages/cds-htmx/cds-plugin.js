const cds = require('@sap/cds')
const assets = require('./lib/assets')
const channels = require('./lib/sse/channels')

cds.once('bootstrap', app => {
  app.use(assets.mountPath, assets.router)
})

cds.on('serving', srv => {
  if (!srv.endpoints?.some(e => e.kind === 'htmx')) return
  const { registerSourceEvents } = require('./lib/sse/side-effects-engine')
  registerSourceEvents(srv)
})

cds.on('shutdown', () => channels.closeAll())
