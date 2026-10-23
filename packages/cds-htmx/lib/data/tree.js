const cds = require('@sap/cds')
const queryLib = require('./query')
const { keyElements, entityDef } = require('../annotations/edm')

const { SELECT } = cds.ql

/** Tree table data (`Aggregation.RecursiveHierarchy`). A hierarchy is read level by level -- the way FE's
 *  `TopLevels`/`descendants` requests do -- with plain service queries, so authorization and handlers apply:
 *   - the top level (no parent, or the children of the object page's own row), paged like a flat table
 *   - the children of one node, when the user expands it
 *   - with a filter or search: the matching nodes plus the ancestors that lead to them, fully expanded
 *  Every row gets `_level` (distance from the top level) and `_state` (`leaf | collapsed | expanded`). */

const ref = name => ({ ref: [name] })
const val = value => ({ val: value })

/** Nodes read in one go below a node, and as matches of a filter. */
const LIMIT = 1000
const MAX_DEPTH = 50

const topWhere = (hierarchy, rootParent) => rootParent == null ? [ref(hierarchy.parentKey), 'is', 'null'] : [ref(hierarchy.parentKey), '=', val(rootParent)]

/** The ids among `ids` that have at least one child. */
async function withChildren(tx, entityType, hierarchy, ids) {
  if (!ids.length) return new Set()
  const rows = await tx.run(SELECT.from(entityType).columns(hierarchy.parentKey).where({ [hierarchy.parentKey]: { in: ids } }).groupBy(hierarchy.parentKey))
  return new Set(rows.map(r => r[hierarchy.parentKey]))
}

async function markStates(tx, entityType, hierarchy, rows, level) {
  const parents = await withChildren(tx, entityType, hierarchy, rows.map(r => r[hierarchy.nodeProperty]))
  for (const row of rows) {
    row._level = level
    row._state = parents.has(row[hierarchy.nodeProperty]) ? 'collapsed' : 'leaf'
  }
  return rows
}

/** The top level, one page of it: `{ rows, hasMore, count }`. `rootParent` is the id of the object page row whose children
 *  form the table (the list report's top level has none). */
async function topLevel(tx, model, entityType, layout, { query, rootParent, skip = 0, limit }) {
  const hierarchy = layout.table.hierarchy
  const where = topWhere(hierarchy, rootParent)
  const [found, counted] = await Promise.all([
    tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: where, query, skip, limit })),
    tx.run(queryLib.listReportCountQuery(entityType, { filters: where }))
  ])
  const hasMore = found.length > limit
  const tops = await markStates(tx, entityType, hierarchy, hasMore ? found.slice(0, limit) : found, 0)
  const rows = await expandInitially(tx, model, entityType, layout, tops, query)
  return { rows, hasMore, count: counted.count }
}

/** `initialExpansionLevel`: the nodes above that level come open, their children read now and listed below them (the client
 *  finds them loaded, like the result of a filter). At most LIMIT rows are read this way. */
async function expandInitially(tx, model, entityType, layout, tops, query) {
  const levels = layout.table.hierarchy.initialExpansionLevel
  if (!levels) return tops
  const rows = []
  const walk = async row => {
    rows.push(row)
    if (row._level >= levels || row._state !== 'collapsed' || rows.length >= LIMIT) return
    const { rows: children } = await childrenOf(tx, model, entityType, layout, { node: row[layout.table.hierarchy.nodeProperty], level: row._level + 1, query })
    row._state = 'expanded'
    row._loaded = true
    for (const child of children) await walk(child)
  }
  for (const top of tops) await walk(top)
  return rows
}

/** The children of one node (the rows to insert below it, one level deeper), one page of them: `{ rows, hasMore }`. `skip` is
 *  how many the table already has. */
async function childrenOf(tx, model, entityType, layout, { node, level, query, skip = 0, limit = LIMIT }) {
  const hierarchy = layout.table.hierarchy
  const found = await tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: [ref(hierarchy.parentKey), '=', val(node)], query, skip, limit }))
  const hasMore = found.length > limit
  return { rows: await markStates(tx, entityType, hierarchy, found.slice(0, limit), level), hasMore }
}

/** What a filter or search leaves of the tree: the matching nodes with their ancestors, expanded down to the matches.
 *  Pages over the top-level nodes of that result like the unfiltered table does. */
async function matching(tx, model, entityType, layout, { filters, search, query, skip = 0, limit }) {
  const hierarchy = layout.table.hierarchy
  const { nodeProperty, parentKey } = hierarchy
  const found = (await tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters, search, query, limit: LIMIT }))).slice(0, LIMIT)
  const byId = new Map(found.map(row => [row[nodeProperty], row]))
  const order = [...found]
  const missingParents = rows => [...new Set(rows.map(r => r[parentKey]).filter(id => id != null && !byId.has(id)))]

  // the ancestors that lead to the matches, level by level
  const columns = queryLib.selectColumns(model, entityType, layout)
  for (let missing = missingParents(found), depth = 0; missing.length && depth < MAX_DEPTH; depth++) {
    const ancestors = await tx.run(SELECT.from(entityType).columns(columns).where({ [nodeProperty]: { in: missing } }))
    for (const row of ancestors) { byId.set(row[nodeProperty], row); order.push(row) }
    missing = missingParents(ancestors)
  }

  const children = new Map()
  const tops = []
  for (const row of order) {
    const parent = row[parentKey]
    if (parent != null && byId.has(parent)) children.set(parent, [...(children.get(parent) ?? []), row])
    else tops.push(row)
  }
  const dbParents = await withChildren(tx, entityType, hierarchy, order.map(r => r[nodeProperty]))

  const page = tops.slice(skip, skip + limit)
  const rows = []
  const walk = (row, level) => {
    const shown = children.get(row[nodeProperty])
    row._level = level
    row._state = shown ? 'expanded' : dbParents.has(row[nodeProperty]) ? 'collapsed' : 'leaf'
    row._loaded = !!shown
    rows.push(row)
    for (const child of shown ?? []) walk(child, level + 1)
  }
  for (const top of page) walk(top, 0)
  return { rows, hasMore: skip + limit < tops.length, count: tops.length }
}

/** The key columns of the hierarchy entity must exist in the row; used as a guard before a tree is rendered. */
function isUsable(model, entityType, hierarchy) {
  const entity = entityDef(model, entityType)
  return !!hierarchy && !!entity?.elements?.[hierarchy.nodeProperty] && keyElements(entity).length > 0
}

module.exports = { topLevel, childrenOf, matching, markStates, isUsable, LIMIT }
