const cds = require('@sap/cds')
const { SELECT } = cds.ql

/** Invoke a bound or unbound action via the service. Returns result and collects req.messages from handlers.
 *  `actionFqn` is the fully qualified action name (e.g., "CatalogService.Books.addStock").
 *  `keys` are the entity keys (for bound actions); pass empty {} for unbound actions.
 *  `params` is the parameter object (e.g., {quantity: 5}). */
async function invokeAction(tx, actionFqn, keys, params = {}) {
  const event = cds.event(actionFqn, { ...keys, ...params })
  const result = await tx.run(event)
  return result
}

module.exports = { invokeAction }
