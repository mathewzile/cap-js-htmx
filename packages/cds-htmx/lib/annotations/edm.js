const cds = require('@sap/cds')

/** Parses a fully-qualified `$Annotations` target string into its structural kind. Shapes
 *  verified live against `cds.compile.to.edm()` output for CatalogService:
 *   - `CatalogService.Books`                                  -> type
 *   - `CatalogService.Books/title`, `.../author/name`          -> property (possibly nav path)
 *   - `CatalogService.EntityContainer/Books`                   -> container-member (entity set)
 *   - `CatalogService.addStock(CatalogService.Books)`          -> action (bound overload)
 *   - `CatalogService.addStock(CatalogService.Books)/quantity` -> action, with a parameter path
 */
function parseTarget(target) {
  const actionMatch = target.match(/^(.+?\.\w+)\(([^)]+)\)(?:\/(.+))?$/)
  if (actionMatch) {
    const [, action, boundEntity, param] = actionMatch
    return { kind: 'action', action, boundEntity, param }
  }
  const containerMatch = target.match(/^(.+\.EntityContainer)\/(\w+)$/)
  if (containerMatch) {
    const [, container, member] = containerMatch
    return { kind: 'container-member', container, entity: `${container.replace(/\.EntityContainer$/, '')}.${member}` }
  }
  const slash = target.indexOf('/')
  if (slash === -1) return { kind: 'type', entity: target }
  return { kind: 'property', entity: target.slice(0, slash), path: target.slice(slash + 1) }
}

/** `author/name` (OData nav path, as it appears in `$Path`/`Target` values) -> `author.name`
 *  (CQL column/path syntax). CAP's own `for.odata` compile already flattens foreign keys onto
 *  the entity itself (`author_ID`), so no further rewriting is needed for those. */
function cqlPath(odataPath) {
  return odataPath.split('/').join('.')
}

function entityDef(model, entityName) {
  return model.definitions?.[entityName]
}

/** Follows a (possibly multi-segment, navigation-crossing) path from an entity type to the
 *  CSN element it ultimately names, e.g. `resolveElement(model, 'CatalogService.Books', 'author/name')`
 *  walks `Books.elements.author.target` (`CatalogService.Authors`) then `.elements.name`. */
function resolveElement(model, entityName, path) {
  let def = entityDef(model, entityName)
  let element
  for (const segment of path.split('/')) {
    element = def?.elements?.[segment]
    if (!element) return undefined
    def = element.target ? entityDef(model, element.target) : undefined
  }
  return element
}

/** The entity type's own key elements (compound keys included; for draft entities this is
 *  the active/draft key, e.g. `ID` — `IsActiveEntity` is added separately by lean draft). */
function keyElements(entity) {
  return Object.values(entity?.elements || {}).filter(e => e.key)
}

/** Finds the association/composition element on `childEntityType` that points back at
 *  `parentEntityType` (e.g. `Chapters.book` -> `Books`, for a `Books.chapters` composition),
 *  so an Object Page table section (§3.4) can filter the child entity set by the flattened
 *  foreign key (`book_ID`) without the renderer having to know the association's name. Assumes
 *  CAP's standard flat FK naming (`<assocName>_<parentKeyName>`), which holds for this model. */
function backlinkElement(model, childEntityType, parentEntityType) {
  const def = entityDef(model, childEntityType)
  for (const [name, el] of Object.entries(def?.elements || {})) {
    if ((el.type === 'cds.Association' || el.type === 'cds.Composition') && el.target === parentEntityType) return name
  }
  return undefined
}

module.exports = { parseTarget, cqlPath, entityDef, resolveElement, keyElements, backlinkElement }
