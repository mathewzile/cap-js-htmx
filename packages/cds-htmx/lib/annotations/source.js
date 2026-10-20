const cds = require('@sap/cds')

/** Per-(csn-model, service, locale) cache of the compiled `$Annotations` map, so a hot path
 *  (every LR/OP request) doesn't recompile CSDL. Keyed by the `cds.model` object itself so a
 *  `cds watch` reload (new model instance) naturally invalidates everything. */
const cache = new WeakMap()

function compile(model, service, locale) {
  const edm = locale ? cds.compile.to.edm(model, { service, locale }) : cds.compile.to.edm(model, { service })
  return edm?.[service]?.$Annotations || {}
}

/** Returns the `$Annotations` map `cds.compile.to.edm()` produces for one service: the exact
 *  same content the real `$metadata` document for that service exposes (verified live against
 *  `/odata/v4/catalog/$metadata`), keyed by fully-qualified target. */
function annotationsOf(model, service, locale) {
  let perModel = cache.get(model)
  if (!perModel) cache.set(model, perModel = new Map())
  const key = `${service}:${locale || ''}`
  let entry = perModel.get(key)
  if (!entry) perModel.set(key, entry = compile(model, service, locale))
  return entry
}

module.exports = { annotationsOf }
