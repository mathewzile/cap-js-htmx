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

/** As in Fiori elements (observed), a tree lists the active nodes only: a draft (a new node, or a changed one) is not a row of it.
 *  `where` gets `IsActiveEntity = true` for a draft-enabled entity. */
const activeOnly = (entityType, where) => entityDef(cds.model, entityType)?.elements?.IsActiveEntity ? [...where, 'and', ref('IsActiveEntity'), '=', val(true)] : where

/** A tree below an object (the Object Page table of a composition: the nodes of one catalog) is read within `layout.table.scope`, the
 *  parent's filter (`parentFilter`: its foreign key and, in a draft, `IsActiveEntity = false` -- the nodes of the draft, as FE reads them).
 *  Without a scope the tree is the whole entity set and lists its active nodes. */
const within = (entityType, scope, where) => scope?.length ? [...where, 'and', ...scope] : activeOnly(entityType, where)

const topWhere = (hierarchy, rootParent, entityType, scope) => within(entityType, scope, rootParent == null ? [ref(hierarchy.parentKey), 'is', 'null'] : [ref(hierarchy.parentKey), '=', val(rootParent)])

/** The ids among `ids` that have at least one child. */
async function withChildren(tx, entityType, hierarchy, ids, scope) {
  if (!ids.length) return new Set()
  const q = SELECT.from(entityType).columns(hierarchy.parentKey).where(within(entityType, scope, [ref(hierarchy.parentKey), 'in', { list: ids.map(val) }]))
  // (a draft-enabled entity does not take `$groupby`: its rows are read as they are and the parents collected here)
  const rows = await tx.run(entityDef(cds.model, entityType)?.elements?.IsActiveEntity ? q : q.groupBy(hierarchy.parentKey))
  return new Set(rows.map(r => r[hierarchy.parentKey]))
}

async function markStates(tx, entityType, hierarchy, rows, level, scope) {
  const parents = await withChildren(tx, entityType, hierarchy, rows.map(r => r[hierarchy.nodeProperty]), scope)
  for (const row of rows) {
    row._level = level
    row._state = parents.has(row[hierarchy.nodeProperty]) ? 'collapsed' : 'leaf'
  }
  return rows
}

/** The top level, one page of it: `{ rows, hasMore, count }`. `rootParent` is the id of the object page row whose children
 *  form the table (the list report's top level has none). */
async function topLevel(tx, model, entityType, layout, { query, rootParent, skip = 0, limit, reveal }) {
  const hierarchy = layout.table.hierarchy
  const scope = layout.table.scope
  const where = topWhere(hierarchy, rootParent, entityType, scope)
  const [found, counted] = await Promise.all([
    tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: where, query, skip, limit })),
    tx.run(queryLib.listReportCountQuery(entityType, { filters: where }))
  ])
  const hasMore = found.length > limit
  const tops = await markStates(tx, entityType, hierarchy, hasMore ? found.slice(0, limit) : found, 0, scope)
  const rows = await expandInitially(tx, model, entityType, layout, tops, query, reveal)
  return { rows, hasMore, count: queryLib.countOf(counted) }
}

/** `initialExpansionLevel`: the nodes above that level come open, their children read now and listed below them (the client
 *  finds them loaded, like the result of a filter). `reveal` (a Set of node ids) opens those nodes as well, whatever their level:
 *  after a node was moved, the path to it is open so it shows where it went. At most LIMIT rows are read this way. */
async function expandInitially(tx, model, entityType, layout, tops, query, reveal) {
  const hierarchy = layout.table.hierarchy
  const scope = layout.table.scope
  const { nodeProperty, parentKey } = hierarchy
  const levels = hierarchy.initialExpansionLevel
  const opens = row => row._level < levels || !!reveal?.has(String(row[nodeProperty]))
  if (!levels && !reveal?.size) return tops
  // One read per level (the children of all its collapsed nodes together) instead of one per node
  const childrenByNode = new Map()
  let frontier = tops
  let read = tops.length
  for (let level = 0; level < MAX_DEPTH && read < LIMIT; level++) {
    const open = frontier.filter(row => row._state === 'collapsed' && opens(row))
    if (!open.length) break
    const found = await tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: within(entityType, scope, [ref(parentKey), 'in', { list: open.map(row => val(row[nodeProperty])) }]), query, limit: LIMIT }))
    frontier = await markStates(tx, entityType, hierarchy, found.slice(0, LIMIT), level + 1, scope)
    for (const row of frontier) childrenByNode.set(row[parentKey], [...(childrenByNode.get(row[parentKey]) ?? []), row])
    read += frontier.length
  }
  const rows = []
  const walk = row => {
    rows.push(row)
    const children = childrenByNode.get(row[nodeProperty])
    if (!opens(row) || row._state !== 'collapsed' || rows.length >= LIMIT || !children) return
    row._state = 'expanded'
    row._loaded = true
    for (const child of children) walk(child)
  }
  for (const top of tops) walk(top)
  return rows
}

/** The children of one node (the rows to insert below it, one level deeper), one page of them: `{ rows, hasMore }`. `skip` is
 *  how many the table already has. */
async function childrenOf(tx, model, entityType, layout, { node, level, query, skip = 0, limit = LIMIT }) {
  const hierarchy = layout.table.hierarchy
  const found = await tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: within(entityType, layout.table.scope, [ref(hierarchy.parentKey), '=', val(node)]), query, skip, limit }))
  const hasMore = found.length > limit
  return { rows: await markStates(tx, entityType, hierarchy, found.slice(0, limit), level, layout.table.scope), hasMore }
}

/** What a filter or search leaves of the tree: the matching nodes with their ancestors, expanded down to the matches.
 *  Pages over the top-level nodes of that result like the unfiltered table does. */
async function matching(tx, model, entityType, layout, { filters, search, query, skip = 0, limit }) {
  const hierarchy = layout.table.hierarchy
  const scope = layout.table.scope
  const { nodeProperty, parentKey } = hierarchy
  const found = (await tx.run(queryLib.listReportQuery(model, entityType, entityType, layout, { filters: scope?.length ? [...filters, ...(filters.length ? ['and'] : []), ...scope] : filters, search, query, limit: LIMIT }))).filter(row => scope?.length || row.IsActiveEntity !== false).slice(0, LIMIT)
  const byId = new Map(found.map(row => [row[nodeProperty], row]))
  const order = [...found]
  const missingParents = rows => [...new Set(rows.map(r => r[parentKey]).filter(id => id != null && !byId.has(id)))]

  // the ancestors that lead to the matches, level by level
  const columns = queryLib.selectColumns(model, entityType, layout)
  for (let missing = missingParents(found), depth = 0; missing.length && depth < MAX_DEPTH; depth++) {
    const ancestors = await tx.run(SELECT.from(entityType).columns(columns).where(within(entityType, scope, [ref(nodeProperty), 'in', { list: missing.map(val) }])))
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
  const dbParents = await withChildren(tx, entityType, hierarchy, order.map(r => r[nodeProperty]), scope)

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
