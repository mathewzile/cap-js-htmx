const cds = require('@sap/cds')
const { formatKeys } = require('../keys')

const { SELECT } = cds.ql

/** What an app does with the startup parameters the launchpad hands it (the target side of an intent-based navigation).
 *
 *  As in Fiori elements (observed in the local launchpad with the Manage Books and Manage Authors apps):
 *   - a parameter that is a property of the List Report filters it (`author_ID`, and also `ID`, which is no filter-bar field), the
 *     filter field shows the value and the table is searched with it; a parameter the report has no property for is ignored;
 *   - when the parameters hold a value for every property of the entity's semantic key (`Common.SemanticKey`) and that finds exactly
 *     one row, the app opens that object's page instead (the active one of a draft root);
 *   - so does the full technical key, the draft key `IsActiveEntity` included (`ID=..&IsActiveEntity=true`; `=false` opens the user's
 *     draft, if there is one). Part of it does not: `ID` alone only filters, the List Report stays.
 *  The answer is a route below the app's service (`/Books(ID=..)` or `/Books?f.author_ID=..`), the form the shell keeps in the hash. */

const MAX_PARAMETERS = 50
const MAX_VALUES = 20
const MAX_LENGTH = 500

/** The parameters as `{ name: string | string[] }`, or `undefined` when `raw` is not what a launchpad hands over: an object of
 *  names with a string or a list of strings each, of a sane size. Empty values are dropped. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const entries = Object.entries(raw)
  if (entries.length > MAX_PARAMETERS) return undefined
  const params = {}
  for (const [name, value] of entries) {
    if (!/^[A-Za-z_][\w]*$/.test(name)) continue
    const values = (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'string' && v !== '' && v.length <= MAX_LENGTH).slice(0, MAX_VALUES)
    if (values.length) params[name] = values.length === 1 ? values[0] : values
  }
  return params
}

/** The `f.<name>` query entries for the parameters that are filter fields of the List Report (the same set `parseFilters` honours). */
function filterQuery(layout, params) {
  const known = new Set([...(layout.filterBar.available || []), ...layout.filterBar.fields].map(f => f.path))
  const query = {}
  for (const [name, value] of Object.entries(params)) if (known.has(name)) query[`f.${name}`] = value
  return query
}

/** `{ property: value }` of the semantic key when the parameters give a single value for each of its properties, else `undefined`. */
function semanticValues(layout, params) {
  const paths = layout.semanticKey
  if (!paths?.length || paths.some(path => path.includes('/') || typeof params[path] !== 'string')) return undefined
  return Object.fromEntries(paths.map(path => [path, params[path]]))
}

/** A parameter's text as the value of the element it filters (numbers and booleans are not compared as text). */
function typed(element, text) {
  if (/^cds\.(Integer|Int16|Int32|Int64|UInt8|Double|Decimal)/.test(element?.type)) { const n = Number(text); return Number.isNaN(n) ? text : n }
  if (element?.type === 'cds.Boolean') return text === 'true'
  return text
}

/** The route an app opens for its startup parameters, or `null` when they change nothing (the entry page as it is).
 *  `layout` is the List Report's, `keyNames` the keys of the entity (`IsActiveEntity` included for a draft root). */
async function startupRoute(tx, { set, entityType, keyNames, isDraftRoot, layout, params }) {
  const elements = cds.model.definitions[entityType]?.elements ?? {}
  // every key property given: the object itself
  if (keyNames.length && keyNames.every(name => typeof params[name] === 'string')) {
    const where = Object.fromEntries(keyNames.map(name => [name, name === 'IsActiveEntity' ? params[name] === 'true' : typed(elements[name], params[name])]))
    const row = await tx.run(SELECT.one.from(entityType).columns(keyNames).where(where))
    if (row) return `/${set}(${formatKeys(Object.fromEntries(keyNames.map(name => [name, row[name]])))})`
  }
  const semantic = semanticValues(layout, params)
  if (semantic) {
    const where = Object.fromEntries(Object.entries(semantic).map(([path, text]) => [path, typed(elements[path], text)]))
    if (isDraftRoot) where.IsActiveEntity = true
    const found = await tx.run(SELECT.from(entityType).columns(keyNames).where(where).limit(2))
    if (found.length === 1) return `/${set}(${formatKeys(Object.fromEntries(keyNames.map(name => [name, found[0][name]])))})`
  }
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(filterQuery(layout, params))) for (const v of [].concat(value)) query.append(name, v)
  return query.size ? `/${set}?${query}` : null
}

module.exports = { sanitize, filterQuery, semanticValues, startupRoute }
