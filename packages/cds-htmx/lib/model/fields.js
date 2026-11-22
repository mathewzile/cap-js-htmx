const { cqlPath } = require('../annotations/edm')

/** `CatalogService.Books` + `author/name` -> `CatalogService.Books/author/name`, the
 *  `$Annotations` target string a property-level (possibly nav-crossing) annotation lives under. */
function propertyTarget(entityType, path) {
  return `${entityType}/${path}`
}

/** Builds the property-level `FieldLayout` for one OData path (§3.2: Common/Core/Measures/
 *  Validation/Communication/HTML5 terms), used by both `list-report.js` (columns) and
 *  `object-page.js` (form fields). Built only from the store, never raw CSN -- `path` is an
 *  OData-syntax path (`stock`, `author/name`); CSN access only ever happens through `edm.js`. */
const NUMERIC_TYPES = new Set(['cds.Integer', 'cds.Int16', 'cds.Int32', 'cds.Int64', 'cds.Integer64', 'cds.UInt8', 'cds.Decimal', 'cds.DecimalFloat', 'cds.Double'])

function buildField(store, entityType, path, { label, withUnit = true } = {}) {
  const target = propertyTarget(entityType, path)
  const bag = store.raw(target)
  // an amount is edited together with its currency (or unit): FE puts the property that holds it in the same field
  const unitPath = withUnit ? (bag['@Measures.ISOCurrency'] ?? bag['@Measures.Unit'])?.$Path : undefined

  const element = require('../annotations/edm').resolveElement(require('@sap/cds').model, entityType, path)
  return {
    path,
    cqlPath: cqlPath(path),
    numeric: NUMERIC_TYPES.has(element?.type), // numbers are shown and edited right-aligned
    label: label ?? bag['@Common.Label'] ?? humanize(path),
    quickInfo: bag['@Common.QuickInfo'],
    // `Common.SemanticObject`: the value is a link that offers the launchpad's targets for that object (a popover, `getLinks`)
    // (through a navigation, `author/name`, it is the one of the property of the target entity)
    semanticObject: semanticObjectOf(store, bag, element),
    semanticLink: semanticLinkOf(store, bag, element),
    text: bag['@Common.Text'],
    textArrangement: bag['@Common.Text@UI.TextArrangement'] ?? bag['@UI.TextArrangement'],
    hidden: bag['@UI.Hidden'],
    fieldControl: bag['@Common.FieldControl'],
    computed: !!bag['@Core.Computed'],
    immutable: !!bag['@Core.Immutable'],
    multiline: !!bag['@UI.MultiLineText'],
    isEmail: !!bag['@Communication.IsEmailAddress'],
    isPhone: !!bag['@Communication.IsPhoneNumber'],
    isUrl: !!bag['@Core.IsURL'],
    valueList: bag['@Common.ValueList'],
    fixedValues: !!bag['@Common.ValueListWithFixedValues'],
    unitField: unitPath && !unitPath.includes('/') ? buildField(store, entityType, unitPath, { withUnit: false }) : undefined,
    unit: bag['@Measures.Unit'],
    currency: bag['@Measures.ISOCurrency'],
    scale: bag['@Measures.Scale'],
    width: bag['@HTML5.CssDefaults']?.width,
    validation: {
      minimum: bag['@Validation.Minimum'],
      maximum: bag['@Validation.Maximum'],
      pattern: bag['@Validation.Pattern'],
      allowedValues: bag['@Validation.AllowedValues']
    }
  }
}

/** The `Common.SemanticObject` of a field: its own, or for a path through a navigation the one of the target entity's property. */
function semanticObjectOf(store, bag, element) {
  return semanticBagOf(store, bag, element)?.['@Common.SemanticObject']
}

/** The annotations of a `Common.SemanticObject` property (its own bag, or the target entity's property for a path through a navigation). */
function semanticBagOf(store, bag, element) {
  if (typeof bag['@Common.SemanticObject'] === 'string') return bag
  const there = element?.parent?.name && element.name ? store.raw(`${element.parent.name}/${element.name}`) : undefined
  return typeof there?.['@Common.SemanticObject'] === 'string' ? there : undefined
}

/** `Common.SemanticObjectMapping` (`{ localProperty: semanticObjectProperty }`, the name the target expects a property under) and
 *  `Common.SemanticObjectUnavailableActions` (the actions of the semantic object that are not offered) of a semantic-object property. */
function semanticLinkOf(store, bag, element) {
  const own = semanticBagOf(store, bag, element)
  if (!own) return undefined
  const pathOf = value => typeof value === 'string' ? value : value?.$PropertyPath
  const mapping = {}
  for (const entry of Array.isArray(own['@Common.SemanticObjectMapping']) ? own['@Common.SemanticObjectMapping'] : []) {
    const local = pathOf(entry?.LocalProperty)
    if (local && typeof entry?.SemanticObjectProperty === 'string') mapping[local] = entry.SemanticObjectProperty
  }
  const unavailable = own['@Common.SemanticObjectUnavailableActions']
  return { mapping, unavailableActions: Array.isArray(unavailable) ? unavailable.filter(a => typeof a === 'string') : [] }
}

/** Fallback label from the property name when no `Common.Label`/`DataField.Label` exists:
 *  `stockStatus` -> `Stock Status`. */
function humanize(path) {
  const last = path.split('/').pop()
  return last
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase())
}

module.exports = { buildField, propertyTarget, humanize }
