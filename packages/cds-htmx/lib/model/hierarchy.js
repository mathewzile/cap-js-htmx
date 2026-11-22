const cds = require('@sap/cds')
const { resolveElement, entityDef } = require('../annotations/edm')

const pathOf = value => typeof value === 'string' ? value : value?.$PropertyPath ?? value?.$NavigationPropertyPath ?? value?.$Path

const ACTIONS_TERM = /^@(?:hierarchy|Hierarchy|com\.sap\.vocabularies\.Hierarchy\.v1)\.RecursiveHierarchyActions(#.+)?$/

/** The `RecursiveHierarchyActions` record of the hierarchy `qualifier`, else the only one the type has. */
function actionsOf(bag, qualifier) {
  const keys = Object.keys(bag).filter(k => ACTIONS_TERM.test(k))
  return bag[keys.find(k => k.endsWith(`#${qualifier}`)) ?? keys[0]]
}

/** A tree table's recursive hierarchy (`Aggregation.RecursiveHierarchy#<qualifier>` on the entity type, which CAP
 *  derives from `@hierarchy`): the node property (the key a child's parent points at) and the parent link, as the
 *  property names the queries need. `qualifier` is the one the FE manifest names (`tableSettings.hierarchyQualifier`);
 *  without it the type's only hierarchy is taken. `initialExpansionLevel` (`tableSettings.initialExpansionLevel`, FE's default is 0:
 *  everything collapsed) is how many levels are open when the table shows. `undefined` when the type declares no (usable) hierarchy. */
function buildHierarchy(store, entityType, qualifier, initialExpansionLevel) {
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
  // `Hierarchy.RecursiveHierarchyActions` (same qualifier, else the entity's only one): the action that puts a node before a sibling
  // (`ChangeNextSiblingAction`, Move Up / Move Down and dropping between siblings) and whether the root nodes may be reordered
  const q = key.split('#')[1]
  const actions = actionsOf(bag, q)
  const siblingName = typeof actions?.ChangeNextSiblingAction === 'string' ? actions.ChangeNextSiblingAction : actions?.ChangeNextSiblingAction?.$Name
  const result = { qualifier: q, nodeProperty, parentNavigation, parentKey, initialExpansionLevel: Math.max(0, Math.floor(Number(initialExpansionLevel)) || 0) }
  if (siblingName) result.siblingAction = `${entityType}.${siblingName.split('.').pop()}`
  if (actions?.ChangeSiblingForRootsSupported === false) result.rootSiblings = false // the order of the top-level nodes is fixed
  return result
}

module.exports = { buildHierarchy }
