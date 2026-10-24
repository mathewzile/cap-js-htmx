const cds = require('@sap/cds')
const { resolveElement } = require('../annotations/edm')

/** What a table column's width is computed from. Fiori elements sizes every column of a table from its property type and its
 *  header (`sap.m.table.Util.calcColumnWidth`) by measuring sample text; the page script (`htmx-tables.js`) does the same
 *  measuring, this says what to measure: the OData type with its constraints, the header and what the cell adds around the text. */

const ODATA_TYPES = {
  'cds.String': 'String', 'cds.LargeString': 'String', 'cds.UUID': 'Guid', 'cds.Boolean': 'Boolean',
  'cds.Integer': 'Int32', 'cds.Int16': 'Int16', 'cds.Int32': 'Int32', 'cds.Int64': 'Int64', 'cds.Integer64': 'Int64', 'cds.UInt8': 'Byte',
  'cds.Decimal': 'Decimal', 'cds.DecimalFloat': 'Decimal', 'cds.Double': 'Double',
  'cds.Date': 'Date', 'cds.Time': 'TimeOfDay', 'cds.DateTime': 'DateTimeOffset', 'cds.Timestamp': 'DateTimeOffset'
}

function typeOf(element) {
  const type = ODATA_TYPES[element?.type]
  if (!type) return undefined
  const spec = { t: type }
  if (type === 'String' && element.type === 'cds.String') spec.m = element.length ?? 255
  if (type === 'Decimal') { spec.p = element.precision; spec.s = element.scale }
  return spec
}

const pathOf = ref => ref?.$Path ?? ref?.$PropertyPath

/** The `data-hf-width` payload of a column header, or undefined when the column has nothing to measure (actions, charts). */
function widthSpec(col, entityType) {
  const field = col.field
  if (!field?.path || col.kind !== 'UI.DataField' || !entityType) return undefined
  const model = cds.model
  const shown = typeOf(resolveElement(model, entityType, field.path))
  if (!shown) return undefined
  const spec = { l: col.label ?? field.label ?? '', types: [shown] }
  const unitPath = pathOf(field.currency) ?? pathOf(field.unit)
  if (unitPath) {
    const unit = typeOf(resolveElement(model, entityType, unitPath.includes('/') ? unitPath : `${field.path.split('/').slice(0, -1).concat(unitPath).join('/')}`))
    if (unit) spec.types.push(unit)
    spec.unit = true
  }
  if (col.criticality) spec.crit = true
  return spec
}

module.exports = { widthSpec }
