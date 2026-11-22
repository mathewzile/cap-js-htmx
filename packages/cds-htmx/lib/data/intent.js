const { TECHNICAL } = require('../model/list-report')

/** The parameters an intent-based navigation passes to its target app, from the row of the page the click is on.
 *
 *  As in Fiori elements (observed with the FE Authors app, "Open Manage Books App" on a book's page): the properties the page has
 *  loaded, that is the ones it shows plus its keys, with a value, and none of the draft or technical ones. The record's
 *  `Mapping` renames a local property to the name the target expects, and `RequiredProperties` are passed even when the page does not
 *  show them (the route reads those from the server). Values are strings, which is what the launchpad puts into the target's URL.
 *  FE also sends a copy of each parameter named with the page's path (`Authors.books.ID`), which a page below another one gets too, and
 *  an app state (the launchpad adapter makes it, `cds-htmx-shell/shell/flp.js`). The plain names are what a target applies. */

const pathOf = value => typeof value === 'string' ? value : value?.$PropertyPath ?? value?.$NavigationPropertyPath ?? value?.$Path

/** Properties that are not data of the object: draft administration the row carries for the page itself. */
const NOT_PASSED = new Set([...TECHNICAL, 'DraftMessages'])

const asParameter = value => value instanceof Date ? value.toISOString() : String(value)
const hasValue = value => value !== null && value !== undefined && value !== '' && typeof value !== 'object' || value instanceof Date

/** `Mapping` of the record -> `{ localProperty: parameterName }`. */
function mappingOf(mapping) {
  const out = {}
  for (const entry of Array.isArray(mapping) ? mapping : []) {
    const local = pathOf(entry?.LocalProperty)
    const name = entry?.SemanticObjectProperty
    if (local && typeof name === 'string' && name) out[local] = name
  }
  return out
}

/** The names of the `RequiredProperties` of the record. */
const requiredOf = required => (Array.isArray(required) ? required : []).map(pathOf).filter(Boolean)

/** The `RequiredProperties` the row does not have, which the route has to read from the server. */
function missingRequired(row, required) {
  return requiredOf(required).filter(name => !hasValue(row?.[name]) && !NOT_PASSED.has(name) && !name.includes('/'))
}

/** `{ name: value }` for the navigation. `row` holds the page's values, `extra` the required properties read separately. */
function intentParams(row, { mapping, required, prefix } = {}, extra = {}) {
  const names = mappingOf(mapping)
  const forced = new Set(requiredOf(required))
  const values = { ...row, ...extra }
  const params = {}
  for (const [property, value] of Object.entries(values)) {
    if (NOT_PASSED.has(property) && !forced.has(property)) continue
    if (!hasValue(value)) continue
    params[names[property] ?? property] = asParameter(value)
  }
  // a page below another one (`Authors(..)/books(..)`) also passes each value under its path, as FE does (`Authors.books.ID`)
  if (prefix) for (const [name, value] of Object.entries({ ...params })) params[`${prefix}.${name}`] = value
  return params
}

/** The path prefix of a page's parameters: its entity sets joined by dots (`Authors(ID=1)/books(ID=2)` -> `Authors.books`); empty for a
 *  page that is not below another one. */
function pathPrefix(path) {
  const sets = String(path).split('/').map(segment => segment.split('(')[0]).filter(Boolean)
  return sets.length > 1 ? sets.join('.') : ''
}

module.exports = { intentParams, missingRequired, mappingOf, pathPrefix }
