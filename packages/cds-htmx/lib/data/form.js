const { resolveElement } = require('../annotations/edm')
const { isReadOnly } = require('../render/field')
const { collectFormFields } = require('./page')

/** A value the user typed that can't be stored (answered with 422 and the form kept as typed). */
class InputError extends Error {
  constructor(message, target) {
    super(message)
    this.name = 'InputError'
    this.status = 422
    this.target = target // the property the value state belongs to
  }
}

const INTEGER = new Set(['cds.Integer', 'cds.Int16', 'cds.Int32', 'cds.Int64', 'cds.UInt8'])

/** A form value (always a string, or absent) -> the type of the CSN element it is stored in.
 *  Empty means "no value" (`null`), like FE sends. Decimals stay strings: JS numbers would round them. */
function coerce(element, raw, label, path) {
  if (raw === undefined) return undefined
  if (element.type === 'cds.Boolean') return raw === true || raw === 'true' || raw === 'on'
  if (raw === '' || raw === null) return null
  if (INTEGER.has(element.type)) {
    if (!/^-?\d+$/.test(String(raw).trim())) throw new InputError(`${label}: enter a whole number`, path)
    return Number.parseInt(raw, 10)
  }
  if (element.type === 'cds.Double' || element.type === 'cds.Decimal') {
    if (!/^-?\d+(\.\d+)?$/.test(String(raw).trim())) throw new InputError(`${label}: enter a number`, path)
    return element.type === 'cds.Double' ? Number(raw) : String(raw).trim()
  }
  return raw
}

/** The values to store for a submitted edit form: exactly the editable fields the Object Page layout
 *  renders (never an arbitrary body key), converted to their element types. `row` feeds dynamic
 *  `FieldControl`; unchecked checkboxes are absent from a form post, hence `false`. */
function formValues(model, entityType, layout, body, { editMode, row = {} } = {}) {
  const values = {}
  const facets = [...(layout.headerFacets || []), ...(layout.sections || [])]
  for (const field of collectFormFields(facets)) {
    if (!field.cqlPath || field.cqlPath.includes('.') || isReadOnly(field, row, editMode)) continue
    const element = resolveElement(model, entityType, field.cqlPath)
    if (!element) continue
    const raw = body?.[field.path]
    if (raw === undefined && element.type !== 'cds.Boolean') continue
    values[field.cqlPath] = coerce(element, raw, field.label || field.path, field.path)
  }
  return values
}

/** The rows of the composition tables of a non-draft Object Page that was edited (`<nav>[<i>].<property>` inputs
 *  plus the `<nav>:present` marker). Only the editable columns are taken. A row keeps its key only when it already
 *  belongs to this object (anything else is a new row with a fresh key), so a posted key can never pull a foreign
 *  row in. Returned as `{ [nav]: rows }` for a deep INSERT/UPDATE: rows left out are deleted with the update. */
async function childRowValues(tx, model, entityType, layout, body, parentKeys) {
  const cds = require('@sap/cds')
  const { collectTableFacets } = require('./page')
  const { keyElements, entityDef } = require('../annotations/edm')
  const queryLib = require('./query')
  const result = {}
  for (const facet of collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])])) {
    const { nav, composition, targetEntityType, columns } = facet.content
    if (!composition || body?.[`${nav}:present`] === undefined) continue
    const keyNames = keyElements(entityDef(model, targetEntityType)).map(k => k.name).filter(n => n !== 'IsActiveEntity')
    const existing = parentKeys
      ? new Set((await tx.run(queryLib.objectPageChildQuery(model, entityType, parentKeys, targetEntityType, keyNames))).map(r => keyNames.map(n => r[n]).join('|')))
      : new Set()
    const re = new RegExp(`^${nav}~(\\w+)\\.(\\w+)$`)
    const posted = new Map()
    for (const [key, value] of Object.entries(body)) {
      const m = re.exec(key)
      if (!m) continue
      if (!posted.has(m[1])) posted.set(m[1], {})
      posted.get(m[1])[m[2]] = value
    }
    const editable = columns.filter(c => c.kind === 'UI.DataField' && c.field?.cqlPath && !c.field.cqlPath.includes('.') && !isReadOnly(c.field, {}, 'direct')).map(c => c.field)
    result[nav] = [...posted.values()].map(raw => {
      const out = {}
      for (const field of editable) {
        if (raw[field.path] === undefined) continue
        out[field.cqlPath] = coerce(resolveElement(model, targetEntityType, field.cqlPath), raw[field.path], field.label || field.path, `${nav}.${field.path}`)
      }
      if (keyNames.every(n => raw[n] != null && existing.has(keyNames.map(k => raw[k]).join('|')))) {
        for (const n of keyNames) out[n] = raw[n]
      } else {
        for (const k of keyElements(entityDef(model, targetEntityType))) if (k.type === 'cds.UUID') out[k.name] = cds.utils.uuid()
      }
      return out
    })
  }
  return result
}

/** Value-help fields whose typed key is not in the value list (messages for the page script). */
async function invalidValueListKeys(tx, layout, values, text) {
  const { keyExists } = require('./value-list')
  const invalid = []
  for (const field of collectFormFields([...(layout.headerFacets || []), ...(layout.sections || [])])) {
    if (!field.valueList || field.fixedValues || !(field.cqlPath in values)) continue
    if (!(await keyExists(tx, field.valueList, values[field.cqlPath]))) invalid.push({ path: field.path, text, severity: 'error' })
  }
  return invalid
}

module.exports = { formValues, coerce, InputError, invalidValueListKeys, childRowValues }
