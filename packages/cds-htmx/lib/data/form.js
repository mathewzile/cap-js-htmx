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

module.exports = { coerce, InputError }
