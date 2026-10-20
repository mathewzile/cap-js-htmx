const cds = require('@sap/cds')
const { typeFromUrl } = require('../annotations/vocab')

const { SELECT } = cds.ql

/** `Common.ValueList.Parameters[]` -> `{collectionPath, valueProp, textProp}` (§3.4: "fixed values
 *  render as a select"). `@type` is the raw compiled vocabulary URL (`store.js` does no generic
 *  `@type` normalization -- verified live, Oct 2026), so it's resolved here with the same
 *  `typeFromUrl()` the LineItem/Facets record-kind lookups already use. The In/InOut parameter's
 *  `ValueListProperty` is the collection-side column backing `<option value>`; a DisplayOnly/Out
 *  parameter's `ValueListProperty` backs the option text (falls back to the value column). */
function parseValueList(valueList) {
  if (!valueList?.CollectionPath) return null
  let valueProp, textProp
  for (const p of valueList.Parameters || []) {
    const kind = typeFromUrl(p['@type'])
    if (kind === 'Common.ValueListParameterInOut' || kind === 'Common.ValueListParameterIn') valueProp = p.ValueListProperty
    else if (kind === 'Common.ValueListParameterDisplayOnly' || kind === 'Common.ValueListParameterOut') textProp = p.ValueListProperty
  }
  if (!valueProp) return null
  // Every parameter that shows a column in the value-help table (constants and filter-only ones do not)
  const columns = []
  for (const p of valueList.Parameters || []) {
    const kind = typeFromUrl(p['@type'])
    if (kind === 'Common.ValueListParameterConstant' || kind === 'Common.ValueListParameterFilterOnly') continue
    if (p.ValueListProperty && !columns.includes(p.ValueListProperty)) columns.push(p.ValueListProperty)
  }
  return { collectionPath: valueList.CollectionPath, valueProp, textProp: textProp || valueProp, columns, searchSupported: valueList.SearchSupported !== false }
}

/** Fetches every row of a fixed-value field's collection (§3.2 Common `ValueListWithFixedValues`:
 *  "render as select", not the searchable value-help dialog used for unbounded `ValueList`s). */
async function fixedValueOptions(tx, valueList) {
  const parsed = parseValueList(valueList)
  if (!parsed) return []
  const { collectionPath, valueProp, textProp } = parsed
  const columns = [...new Set([valueProp, textProp])]
  const rows = await tx.run(SELECT.from(collectionPath).columns(columns))
  return rows.map(r => ({ value: r[valueProp], text: r[textProp] != null ? String(r[textProp]) : String(r[valueProp]) }))
}

/** A key typed into a value-help field must exist in the value list's collection (FE checks it as you leave
 *  the field). Empty is fine (mandatory-ness is another check). Fixed-value lists are a select, never typed. */
async function keyExists(tx, valueList, value) {
  if (value == null || String(value).trim() === '') return true
  const parsed = parseValueList(valueList)
  if (!parsed) return true
  const found = await tx.run(SELECT.one.from(parsed.collectionPath).columns(parsed.valueProp).where({ [parsed.valueProp]: value }))
  return !!found
}

module.exports = { parseValueList, fixedValueOptions, keyExists }
