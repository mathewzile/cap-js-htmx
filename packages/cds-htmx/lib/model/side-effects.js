/**
 * Indexes `Common.SideEffects` (§3.2/§4.2) for one entity type by trigger, so the SSE engine
 * can answer "what re-renders when X changes" without re-scanning the store per field change.
 * Built only from the store; evaluated/applied later by `sse/side-effects-engine.js`.
 */
function buildSideEffects(store, entityType) {
  const effects = store.terms(entityType)
    .filter(t => t.alias === 'Common' && t.term === 'SideEffects')
    .map(t => ({ qualifier: t.qualifier, ...t.value }))

  const byProperty = new Map() // sourceProperty -> [effect]
  const byNavigation = new Map() // sourceEntity (nav/composition name) -> [effect]
  const byEvent = new Map() // SourceEvent name -> [effect]

  for (const effect of effects) {
    for (const prop of effect.SourceProperties || []) {
      if (!byProperty.has(prop)) byProperty.set(prop, [])
      byProperty.get(prop).push(effect)
    }
    for (const nav of effect.SourceEntities || []) {
      if (!byNavigation.has(nav)) byNavigation.set(nav, [])
      byNavigation.get(nav).push(effect)
    }
    for (const event of effect.SourceEvents || []) {
      if (!byEvent.has(event)) byEvent.set(event, [])
      byEvent.get(event).push(effect)
    }
  }

  return { effects, byProperty, byNavigation, byEvent }
}

/** The bound action's own `Common.SideEffects` (no qualifier support per the OData vocabulary;
 *  §4.2.2: "the default, no annotation, re-renders the OP"). `actionTarget` is the full
 *  `$Annotations` action-overload target string from `edm.js#parseTarget`'s `action` field,
 *  e.g. `CatalogService.addStock(CatalogService.Books)`. */
function actionSideEffects(store, actionTarget) {
  return store.get(actionTarget, 'Common.SideEffects')
}

module.exports = { buildSideEffects, actionSideEffects }
