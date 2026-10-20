/** Query-string filters -> CXN `where` array (§3.3: "the parser whitelists element names against
 *  the model (no injection)"). Only `f.<path>[.op]` keys whose `<path>` matches a filter-bar field
 *  already present in the `LRLayout` are honored; everything else (unknown params, typos, an
 *  attacker trying `f.__proto__` or a raw SQL fragment) is silently ignored rather than rejected,
 *  matching how FE's own filter bar only ever sends values for fields it rendered.
 *  Special case: `f.EditingStatus` maps to draft-state WHERE logic (not a model element). */

const OPS = { eq: '=', ge: '>=', le: '<=', gt: '>', lt: '<', ne: '!=' }
const KEY = /^f\.([^.]+)(?:\.(ge|le|gt|lt|ne|eq))?$/

function coerce(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

/** EditingStatus values -> draft-state predicate. Kept flat (no `xpr` grouping, only `and`) so lean
 *  draft still sees `IsActiveEntity` at the top level of the `where` and routes to the drafts table.
 *  `ALL` adds nothing: lean draft's default read already is FE's "All" (actives + own drafts). */
const ref = path => ({ ref: path.split('.') })
const val = v => ({ val: v })

const EDITING_STATUS = {
  ALL: [],
  OWN_DRAFT: [ref('IsActiveEntity'), '=', val(false)],
  UNCHANGED: [ref('IsActiveEntity'), '=', val(true), 'and', ref('HasDraftEntity'), '=', val(false)]
}

/** `query` is `req.query` (already URL-decoded by express). Returns a CXN predicate array usable
 *  as `SELECT.where(...)`, e.g. `[{ref:['stock']}, '>=', {val:10}, 'and', {ref:['genre_ID']}, 'in',
 *  {list:[{val:'A'},{val:'B'}]}]`. Every token must be a real CXN object: `.where(array)` passes the
 *  array through untouched, and a bare string there is rendered into the SQL verbatim. */
function parseFilters(query, layout) {
  const byPath = new Map(layout.filterBar.fields.map(f => [f.path, f]))
  const clauses = []

  // not a model element, so it bypasses the filter-bar whitelist -- but only for draft roots, and
  // only with one of the fixed values (anything else is ignored like an unknown field)
  if (layout.filterBar.editingStatus) {
    const status = query?.['f.EditingStatus']
    if (Object.hasOwn(EDITING_STATUS, status)) clauses.push(...EDITING_STATUS[status])
  }

  for (const [key, raw] of Object.entries(query || {})) {
    const m = key.match(KEY)
    if (!m) continue
    const [, path, op = 'eq'] = m
    const field = byPath.get(path)
    if (!field) continue // whitelist: not a rendered filter-bar field -> ignore
    const values = (Array.isArray(raw) ? raw : [raw]).filter(v => v !== '').map(coerce)
    if (!values.length) continue
    if (clauses.length) clauses.push('and')
    if (op === 'eq' && values.length > 1) clauses.push(ref(field.cqlPath), 'in', { list: values.map(val) })
    else clauses.push(ref(field.cqlPath), OPS[op], val(values[0]))
  }

  return clauses
}

/** `$search` is passed through as-is to `.search()` (parameterized by the CQL builder, not string
 *  concatenation) -- there is no element-name whitelisting to do for free text. */
function parseSearch(query) {
  const term = query?.$search
  return typeof term === 'string' && term.trim() ? term.trim() : undefined
}

module.exports = { parseFilters, parseSearch, EDITING_STATUS }
