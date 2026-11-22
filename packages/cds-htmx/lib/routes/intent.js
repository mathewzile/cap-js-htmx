const cds = require('@sap/cds')
const keysLib = require('../keys')
const { loadObjectPage } = require('../data/page')
const { entityDef, keyElements } = require('../annotations/edm')
const { intentParams, missingRequired, pathPrefix } = require('../data/intent')
const startupLib = require('../data/startup')
const cache = require('../model/cache')

const { SELECT } = cds.ql

const isIntent = col => col?.kind === 'UI.DataFieldForIntentBasedNavigation' || col?.kind === 'UI.DataFieldWithIntentBasedNavigation'

/** Every intent-based navigation action an Object Page layout has: the buttons of its form sections and of its header. */
function intentsOf(layout) {
  const found = []
  const visit = facet => {
    if (facet.kind === 'CollectionFacet') facet.facets.forEach(visit)
    else if (facet.content?.kind === 'form') found.push(...facet.content.fields.filter(isIntent))
  }
  for (const facet of [...(layout.headerFacets || []), ...(layout.sections || [])]) visit(facet)
  found.push(...(layout.headerActions || []).filter(isIntent))
  return found
}

/** Intent-based navigation routes. Mixed into `HtmxAdapter`, so `this` is the adapter. */
module.exports = {
  /** `GET /$startup?set=<entry set>&params=<JSON of the startup parameters>`: where an app opens when a launchpad starts it with
   *  parameters (the target side of an intent-based navigation, `lib/data/startup.js`). `{ route }` is a route below the service
   *  (the object's page, or the List Report with the filters), `{ route: null }` when the parameters change nothing. */
  async startupTarget(req, res, tx) {
    const { set } = req.query
    const entity = typeof set === 'string' && this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    let params
    try { params = startupLib.sanitize(JSON.parse(req.query.params)) } catch { /* not JSON */ }
    if (!params) return res.sendStatus(400)

    const entityType = entity.name
    const layout = cache.listReportFor(cds.model, this.service.name, this.odataServicePath(), entityType, `/${set}`, this.appOpts(req))
    const definition = entityDef(cds.model, entityType)
    const keyNames = keyElements(definition).map(k => k.name)
    const route = await startupLib.startupRoute(tx, { set, entityType, keyNames, isDraftRoot: keyNames.includes('IsActiveEntity'), layout, params })
    res.set('Cache-Control', 'no-store').json({ route })
  },

  /** `GET /$intent?path=<object path>&so=<semantic object>&action=<action>`: the parameters the click on that intent button of the
   *  page of `path` passes to the target app, as `{ params }` (`lib/data/intent.js`). The intent must be one the page's layout declares,
   *  so the annotations, not the request, decide the mapping and the required properties. The row is read as the page reads it
   *  (service query, so authorization applies), without its table sections. */
  async intentParameters(req, res, tx) {
    const { path, so, action } = req.query
    if (typeof path !== 'string' || typeof so !== 'string' || typeof action !== 'string' || path.length > 2000) return res.sendStatus(400)
    const target = this.resolveObject(keysLib.splitSegments(path))
    if (!target) return res.sendStatus(404)

    const { appRoot, locale, app } = this.appOpts(req)
    const { entityType, keys, contextPath } = target
    const page = await loadObjectPage(tx, {
      service: this.service.name, servicePath: this.odataServicePath(), entityType, keys, contextPath, appRoot, locale, app,
      editing: keys.IsActiveEntity === false, need: { sections: new Set(), fields: new Set() }
    })
    if (!page) return res.sendStatus(404)
    // the intent is one of the page's, or (for the row of a table) one of the columns of the entity set's List Report
    let intent = intentsOf(page.layout).find(col => col.semanticObject === so && col.action === action)
    const set = path.split('(')[0]
    if (!intent && !path.includes('/') && this.entitySet(set)) {
      const list = cache.listReportFor(cds.model, this.service.name, this.odataServicePath(), entityType, `/${set}`, this.appOpts(req))
      intent = [...list.table.columns, ...(list.table.extraColumns ?? [])].filter(isIntent).find(col => col.semanticObject === so && col.action === action)
    }
    if (!intent) return res.sendStatus(404)

    // the required properties the page does not show
    const elements = entityDef(cds.model, entityType)?.elements ?? {}
    const missing = missingRequired(page.row, intent.requiredProperties).filter(name => elements[name] && !elements[name].isAssociation)
    const extra = missing.length ? await tx.run(SELECT.one.from(entityType).columns(missing).where(keys)) : {}

    res.set('Cache-Control', 'no-store').json({ params: intentParams(page.row, { mapping: intent.mapping, required: intent.requiredProperties, prefix: pathPrefix(path) }, extra ?? {}) })
  }
}
