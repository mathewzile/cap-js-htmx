const cds = require('@sap/cds')
const { resolveElement, entityDef } = require('../annotations/edm')

const pathOf = value => typeof value === 'string' ? value : value?.$PropertyPath ?? value?.$NavigationPropertyPath ?? value?.$Path

/** A tree table's recursive hierarchy (`Aggregation.RecursiveHierarchy#<qualifier>` on the entity type, which CAP
 *  derives from `@hierarchy`): the node property (the key a child's parent points at) and the parent link, as the
 *  property names the queries need. `qualifier` is the one the FE manifest names (`tableSettings.hierarchyQualifier`);
 *  without it the type's only hierarchy is taken. `undefined` when the type declares no (usable) hierarchy. */
function buildHierarchy(store, entityType, qualifier) {
  const bag = store.raw(entityType)
  const key = qualifier
    ? `@Aggregation.RecursiveHierarchy#${qualifier}`
    : Object.keys(bag).find(k => k.startsWith('@Aggregation.RecursiveHierarchy#'))
  const declaration = key && bag[key]
  if (!declaration) return undefined
  const nodeProperty = pathOf(declaration.NodeProperty)
  const parentNavigation = pathOf(declaration.ParentNavigationProperty)
  if (!nodeProperty || !parentNavigation) return undefined
  const parent = resolveElement(cds.model, entityType, parentNavigation)
  const referenced = parent?.keys?.length === 1 ? parent.keys[0].ref.join('_') : nodeProperty
  const parentKey = `${parentNavigation}_${referenced}`
  if (!entityDef(cds.model, entityType)?.elements?.[parentKey]) return undefined
  return { qualifier: key.split('#')[1], nodeProperty, parentNavigation, parentKey }
}

module.exports = { buildHierarchy }
