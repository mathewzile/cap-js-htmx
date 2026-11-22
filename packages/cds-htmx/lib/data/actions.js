/** Invoke a bound or unbound action via the service. Returns result and collects req.messages from handlers.
 *  `actionFqn` is the fully qualified action name (e.g., "CatalogService.Books.addStock", or "CatalogService.submitOrder" when unbound).
 *  `keys` are the entity keys (for bound actions); pass empty {} for unbound actions.
 *  `params` is the parameter object (e.g., {quantity: 5}). */
async function invokeAction(tx, actionFqn, keys, params = {}) {
  const at = actionFqn.lastIndexOf('.')
  const event = actionFqn.slice(at + 1)
  const entity = actionFqn.slice(0, at)
  if (!entity || entity === tx.name) return tx.send({ event, data: params })
  return tx.send({ event, entity, params: [keys], data: params })
}

module.exports = { invokeAction }
