const cds = require('@sap/cds')
const { html } = require('../render/html')
const channels = require('../sse/channels')
const { keyElements } = require('../annotations/edm')
const keysLib = require('../keys')
const playgroundRender = require('../render/playground')

/** The development-only SSE playground.
 *  Mixed into `HtmxAdapter` (`Object.assign(HtmxAdapter.prototype, ...)`), so `this` is the adapter. */
module.exports = {
  /** Dev-only SSE playground (see `render/playground.js`); 404 in production. */
  playgroundEnabled() {
    return !cds.env.production
  },

  playgroundClientRows() {
    return [...channels.clients.entries()].map(([id, c]) => ({
      id, user: c.user?.id ?? '?', app: c.app,
      view: !c.view ? 'nothing yet' : c.view.list ? `List Report ${c.view.set}` : `${c.view.entitySetPath} (${c.view.keys?.IsActiveEntity === false ? 'draft' : 'display'})`
    }))
  },

  async playground(req, res, tx) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const base = this.basePath(req)
    const links = []
    let exampleId
    for (const [name, entity] of Object.entries(this.service.entities)) {
      if (!entity['@UI.LineItem'] || name.endsWith('.drafts')) continue
      const keyNames = keyElements(entity).map(k => k.name).filter(n => n !== 'IsActiveEntity')
      links.push({ href: `${base}/${name}`, label: `${name} (List Report)` })
      const rows = await tx.run(SELECT.from(entity.name).columns(keyNames).limit(5)).catch(() => [])
      for (const row of rows) {
        const keys = { ...row, ...(entity.drafts ? { IsActiveEntity: true } : {}) }
        exampleId ??= row.ID
        links.push({ href: `${base}/${name}(${keysLib.formatKeys(keys)})`, label: `${name} ${Object.values(row).join(', ')}` })
      }
    }
    const actions = Object.entries(this.service.actions || {}).map(([name, def]) => ({
      name,
      params: Object.entries(def.params || {}).map(([pname, p]) => ({
        name: pname, type: String(p.type).replace('cds.', ''), example: p.type === 'cds.UUID' ? exampleId : p.type === 'cds.Integer' ? '10' : ''
      }))
    }))
    const watchSet = links.find(l => l.label.endsWith('(List Report)'))?.label.split(' ')[0]
    const body = playgroundRender.playground({ watchSet, basePath: base, service: this.service.name, links, actions, clients: this.playgroundClientRows(), t: x => x })
    this.render(req, res, { title: 'SSE playground', body })
  },

  /** The playground's own channel pretends to be a List Report of `set`, so row pushes show up in its log. */
  async playgroundWatch(req, res) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const entity = this.entitySet(String(req.body?.set))
    if (!entity || !channels.forUser(req.body?.client)) return res.sendStatus(404)
    channels.setView(req.body.client, this.viewOf(req, { entityType: entity.name, list: true, set: req.body.set }))
    res.sendStatus(204)
  },

  async playgroundClients(req, res) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    res.type('html').send(String(playgroundRender.clientsTable(this.playgroundClientRows(), { t: x => x })))
  },

  async playgroundAction(req, res, tx) {
    if (!this.playgroundEnabled()) return res.sendStatus(404)
    const def = this.service.actions?.[req.params.name]
    if (!def) return res.sendStatus(404)
    const params = {}
    for (const [name, p] of Object.entries(def.params || {})) {
      const raw = req.body?.[name]
      if (raw === undefined || raw === '') continue
      params[name] = ['cds.Integer', 'cds.Int32', 'cds.Int64'].includes(p.type) ? Number(raw) : raw
    }
    try {
      const result = await tx.send(req.params.name, params)
      res.type('html').send(String(html`ok${result === undefined ? '' : ' ' + JSON.stringify(result)}`))
    } catch (err) {
      res.status(200).type('html').send(String(html`failed: ${err.message}`))
    }
  }
}
