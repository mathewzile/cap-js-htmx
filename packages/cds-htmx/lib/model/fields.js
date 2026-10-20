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
function buildField(store, entityType, path, { label } = {}) {
  const target = propertyTarget(entityType, path)
  const bag = store.raw(target)

  return {
    path,
    cqlPath: cqlPath(path),
    label: label ?? bag['@Common.Label'] ?? humanize(path),
    quickInfo: bag['@Common.QuickInfo'],
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
