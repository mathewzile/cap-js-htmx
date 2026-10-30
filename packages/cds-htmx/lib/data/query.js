const cds = require('@sap/cds')
const { paths: pathsOf } = require('../annotations/expressions')
const { cqlPath, entityDef, keyElements, backlinkElement } = require('../annotations/edm')

const { SELECT } = cds.ql

/** True for draft-root entity types (`@odata.draft.enabled`, lean-draft's own marker: `Entity.drafts`
 *  is the compiled draft shadow entity). Used to add the extra columns the List Report draft
 *  indicator needs (§3.4: "draft rows show a 'Draft' / 'Locked by …' link under the first column") --
 *  `IsActiveEntity` is already pulled in by `keyElements()` since it's a draft root's (virtual) key. */
function isDraftRoot(entity) {
  return !!entity?.drafts
}

/** Who is editing the draft of one object (`DraftAdministrativeData.InProcessByUser`). The service does not
 *  support the path inside a column list ("Navigation ... in expand is not supported"), so the draft's
 *  administrative record is read by its UUID. Null when there is no such draft. */
async function draftLockUser(tx, entityType, where) {
  try {
    const draft = await tx.run(SELECT.one.from(entityType).columns('DraftAdministrativeData_DraftUUID as uuid').where(where))
    if (!draft?.uuid) return null
    const admin = await cds.db.run(SELECT.one.from('DRAFT.DraftAdministrativeData').columns('InProcessByUser').where({ DraftUUID: draft.uuid }))
    return admin?.InProcessByUser ?? null
  } catch {
    return null
  }
}

/** Rows whose active version has a draft get `_draftOwn`: true when that draft is the current user's, else
 *  it is locked by somebody else (FE shows "Draft" for the former, "Locked" for the latter). Only needed
 *  when the table shows the indicator (a `Common.SemanticKey` column), so other tables pay nothing.
 *  The drafts of all rows are read in one statement and their administrative records in a second one. */
async function markDraftOwners(tx, entityType, layout, rows, userId) {
  if (!layout.semanticKey?.length || !isDraftRoot(entityDef(cds.model, entityType))) return
  const keyNames = keyElements(entityDef(cds.model, entityType)).map(k => k.name).filter(n => n !== 'IsActiveEntity')
  const drafted = rows.filter(r => r.IsActiveEntity !== false && r.HasDraftEntity === true)
  if (!drafted.length) return
  if (keyNames.length !== 1) {
    // compound keys: one lookup per row
    await Promise.all(drafted.map(async row => {
      const where = { IsActiveEntity: false, ...Object.fromEntries(keyNames.map(n => [n, row[n]])) }
      row._draftOwn = (await draftLockUser(tx, entityType, where)) === userId
    }))
    return
  }
  const [key] = keyNames
  try {
    const drafts = await tx.run(SELECT.from(entityType).columns(key, 'DraftAdministrativeData_DraftUUID as uuid').where({ IsActiveEntity: false, [key]: { in: drafted.map(r => r[key]) } }))
    const uuidOf = new Map(drafts.map(d => [d[key], d.uuid]))
    const uuids = [...new Set(uuidOf.values())].filter(Boolean)
    const admins = uuids.length ? await cds.db.run(SELECT.from('DRAFT.DraftAdministrativeData').columns('DraftUUID', 'InProcessByUser').where({ DraftUUID: { in: uuids } })) : []
    const ownerOf = new Map(admins.map(a => [a.DraftUUID, a.InProcessByUser]))
    for (const row of drafted) row._draftOwn = (ownerOf.get(uuidOf.get(row[key])) ?? null) === userId
  } catch {
    for (const row of drafted) row._draftOwn = false
  }
}

/** The rows of one page and the total. When the page is not full (no row beyond `limit`) the rows already tell the total, so the
 *  count statement is only sent when there is more to see. Not used for draft roots: the "All" read counts actives only. */
async function pageAndCount(tx, entityType, rowsQuery, countQuery, { skip = 0, limit, exact = false }) {
  // `exact`: the query pins the draft state (a table section), so rows and count cover the same set
  if (!exact && isDraftRoot(entityDef(cds.model, entityType))) {
    const [rows, counted] = await Promise.all([tx.run(rowsQuery), tx.run(countQuery)])
    return { rows, count: countOf(counted) }
  }
  const rows = await tx.run(rowsQuery)
  if (rows.length <= limit) return { rows, count: skip + rows.length }
  return { rows, count: countOf(await tx.run(countQuery)) }
}

/** The union of every `$Path` reachable from the rendered columns/filter fields/key, mapped
 *  OData -> CQL (§3.3: "the union of `paths()` over all rendered annotation values ... mapped
 *  OData -> CQL by `edm.js`"). Walking the whole column/field object (not just `.field.cqlPath`)
 *  also picks up paths hiding inside `hidden`/`criticality`/`fieldControl` expressions. */
function selectColumns(model, entityType, layout) {
  const cols = new Set()
  const entity = entityDef(model, entityType)
  for (const key of keyElements(entity)) cols.add(key.name)
  if (isDraftRoot(entity)) cols.add('HasDraftEntity')
  // a tree table reads the parent link of every node
  if (layout.table.hierarchy) { cols.add(layout.table.hierarchy.nodeProperty); cols.add(layout.table.hierarchy.parentKey) }
  for (const col of layout.table.columns) {
    if (col.field?.cqlPath) cols.add(col.field.cqlPath)
    for (const p of pathsOf(col)) cols.add(cqlPath(p))
  }
  for (const col of layout.table.extraColumns ?? []) cols.add(col.field.cqlPath) // the columns View Settings can add
  for (const field of layout.filterBar.fields) {
    cols.add(field.cqlPath)
    for (const p of pathsOf(field)) cols.add(cqlPath(p))
  }
  return [...cols]
}

/** A single sort-order entry's `Property` is sometimes a plain OData path string, sometimes a
 *  `{$PropertyPath}`/`{$Path}` wrapper, depending on which compiler path produced it -- normalize
 *  defensively since the sample model doesn't exercise `PresentationVariant.SortOrder` yet. */
function sortPropertyPath(entry) {
  const prop = entry?.Property
  if (typeof prop === 'string') return prop
  return prop?.$PropertyPath ?? prop?.$Path
}

function defaultOrderBy(layout) {
  const sortOrder = layout.table.sortOrder
  if (!Array.isArray(sortOrder) || !sortOrder.length) return []
  return sortOrder
    .map(entry => {
      const path = sortPropertyPath(entry)
      return path ? `${cqlPath(path)}${entry.Descending ? ' desc' : ''}` : null
    })
    .filter(Boolean)
}

/** `$orderby` query-string override (OData syntax: `stock desc,title`), used by the column-header
 *  sort popover (§3.4). Only element names already selected as columns are honored, so an
 *  unrelated/typo'd path can't be used to probe column existence. */
function parseOrderBy(query, columns) {
  const raw = query?.$orderby
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const known = new Set(columns)
  const terms = raw.split(',').map(t => t.trim()).filter(Boolean).map(t => {
    const [path, dir] = t.split(/\s+/)
    return { path: cqlPath(path), desc: dir?.toLowerCase() === 'desc' }
  }).filter(t => known.has(t.path))
  if (!terms.length) return undefined
  return terms.map(t => `${t.path}${t.desc ? ' desc' : ''}`)
}

/** Builds the List Report table SELECT (§3.3): columns from the layout model, `.where()` from the
 *  parsed filters, `.search()` for free text, `.orderBy()` from `$orderby` or the layout's default
 *  `PresentationVariant.SortOrder`, and `.limit()` for growing ("More"). */
function listReportQuery(model, entitySet, entityType, layout, { filters = [], search, query, skip = 0, limit, tieBreak = false } = {}) {
  const columns = selectColumns(model, entityType, layout)
  // a path column carries the alias it gets anyway (`author.name as author_name`): lean draft's "All" read looks for the
  // sort columns by alias and adds a second one for a path without it ("Duplicate definition of element author_name")
  let q = SELECT.from(entitySet).columns(columns.map(c => c.includes('.') ? { ref: c.split('.'), as: c.replaceAll('.', '_') } : c))
  if (filters.length) q = q.where(filters)
  if (search) q = q.search(search)
  const orderBy = parseOrderBy(query, columns) || defaultOrderBy(layout)
  if (orderBy.length || tieBreak) {
    // Paging with `$skip` needs a total order: rows that tie on the sort column would otherwise repeat or go missing between pages
    const keys = keyElements(entityDef(model, entityType)).map(k => k.name).filter(k => k !== 'IsActiveEntity' && !orderBy.some(t => t.split(' ')[0] === k))
    q = q.orderBy(...orderBy, ...keys)
  }
  q = q.limit((limit ?? layout.table.growingThreshold) + 1, skip) // +1: cheap has-more-rows probe, trimmed by the caller
  return q
}

/** The rows of a table section: the child rows that belong to one parent object, as a `where` for `listReportQuery` (the
 *  same filter `objectPageChildQuery` builds, in CXN form). */
function parentFilter(model, parentEntityType, parentKeys, childEntityType) {
  return objectPageChildQuery(model, parentEntityType, parentKeys, childEntityType, ['*']).SELECT.where || []
}

/** Not `SELECT.one`, and the column is `$count`: lean draft's "All" read (actives + own drafts) runs the count as a
 *  list, reads `$count` off the active rows and answers `{ $count }`; every other read answers `[{ $count }]`
 *  (see `countOf`). */
function listReportCountQuery(entitySet, { filters = [], search } = {}) {
  let q = SELECT.from(entitySet).columns({ func: 'count', args: ['*'], as: '$count' })
  if (filters.length) q = q.where(filters)
  if (search) q = q.search(search)
  return q
}

/** The number out of what `listReportCountQuery` returned, whichever read answered it. */
function countOf(result) {
  const row = Array.isArray(result) ? result[0] : result
  return Number(row?.count ?? row?.$count ?? 0)
}

/** A single facet's non-table content (form/dataPoint/contact/address/chart -- §3.2 Facets):
 *  collects every column/field inside it. `table`-kind content is deliberately skipped -- it
 *  targets a *different* entity type (the composition's child), fetched by its own query via
 *  `objectPageChildQuery`, so its columns must never leak into the parent SELECT. */
function collectFacetColumns(facet, cols) {
  if (!facet) return
  if (facet.kind === 'CollectionFacet') return (facet.facets || []).forEach(f => collectFacetColumns(f, cols))
  for (const p of pathsOf(facet.hidden)) cols.add(cqlPath(p))
  const content = facet.content
  if (!content) return
  if (content.kind === 'form') {
    for (const col of content.fields) {
      if (col.field?.cqlPath) cols.add(col.field.cqlPath)
      for (const p of pathsOf(col)) cols.add(cqlPath(p))
    }
  } else if (content.kind === 'dataPoint') {
    for (const p of pathsOf(content.dataPoint)) cols.add(cqlPath(p))
  } else if (content.kind === 'contact') {
    for (const p of pathsOf(content.contact)) cols.add(cqlPath(p))
  } else if (content.kind === 'address') {
    for (const p of pathsOf(content.address)) cols.add(cqlPath(p))
  } else if (content.kind === 'chart') {
    for (const p of pathsOf(content.chart)) cols.add(cqlPath(p))
  }
  // 'table' / 'identification' / 'unknown': not value-bearing against this entity type -- skip
}

/** The Object Page equivalent of `selectColumns`: walks the whole `OPLayout` tree (header,
 *  headerFacets, sections, headerActions) instead of a flat table/filter-bar column list. */
function objectPageColumns(model, entityType, layout) {
  const cols = new Set()
  for (const key of keyElements(entityDef(model, entityType))) cols.add(key.name)
  // draft roots: what the draft marker needs to offer "Saved Version" / "Draft" (HasDraftEntity also locks Edit/Delete)
  if (isDraftRoot(entityDef(model, entityType))) { cols.add('HasActiveEntity'); cols.add('HasDraftEntity'); cols.add('DraftMessages') }
  for (const p of pathsOf(layout.header?.title)) cols.add(cqlPath(p))
  for (const p of pathsOf(layout.header?.description)) cols.add(cqlPath(p))
  for (const facet of layout.headerFacets || []) collectFacetColumns(facet, cols)
  for (const facet of layout.sections || []) collectFacetColumns(facet, cols)
  for (const col of layout.headerActions || []) {
    if (col.field?.cqlPath) cols.add(col.field.cqlPath)
    for (const p of pathsOf(col)) cols.add(cqlPath(p))
  }
  return [...cols]
}

/** Fetches the Object Page's own row by key, with exactly the columns its layout renders. */
function objectPageQuery(entitySet, keys, columns) {
  return SELECT.one.from(entitySet).columns(columns).where(keys)
}

/** Fetches the rows for a table-section's child entity (e.g. `Books/chapters`), filtered by the
 *  flattened foreign key back to the parent (§3.4: "Table subsections reuse `table.js`"). CAP's
 *  draft-enabled children share `IsActiveEntity` with their parent, so that's matched too. */
function objectPageChildQuery(model, parentEntityType, parentKeys, childEntityType, columns) {
  const assoc = backlinkElement(model, childEntityType, parentEntityType)
  const where = {}
  // the draft state follows the parent into a draft node; a child that is not draft-enabled (an association such as Authors.books of a
  // draft root) has none
  if ('IsActiveEntity' in parentKeys && entityDef(model, childEntityType)?.elements?.IsActiveEntity) where.IsActiveEntity = parentKeys.IsActiveEntity
  if (assoc) {
    for (const [k, v] of Object.entries(parentKeys)) {
      if (k === 'IsActiveEntity') continue
      where[`${assoc}_${k}`] = v
    }
  }
  return SELECT.from(childEntityType).columns(columns).where(where)
}

module.exports = {
  selectColumns, listReportQuery, listReportCountQuery, countOf, pageAndCount, defaultOrderBy, parseOrderBy,
  objectPageColumns, objectPageQuery, objectPageChildQuery, parentFilter, markDraftOwners, draftLockUser
}
