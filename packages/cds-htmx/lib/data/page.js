const cds = require('@sap/cds')
const cache = require('../model/cache')
const queryLib = require('./query')
const valueListLib = require('./value-list')
const treeLib = require('./tree')
const sectionLib = require('./section')
const { keyElements, entityDef } = require('../annotations/edm')

/** Finds every `content.kind === 'table'` facet (recursing into `CollectionFacet` nesting) so the
 *  Object Page can fetch each sub-section's child rows with its own query (§3.4: "Table
 *  subsections reuse `table.js`"). */
function collectTableFacets(facets, out = []) {
  for (const facet of facets || []) {
    if (facet.kind === 'CollectionFacet') collectTableFacets(facet.facets, out)
    else if (facet.content?.kind === 'table') out.push(facet)
  }
  return out
}

/** Finds every `content.kind === 'form'` facet's fields (recursing into `CollectionFacet` nesting)
 *  so `Common.ValueListWithFixedValues` options can be fetched once per page (§3.4 field renderer
 *  table: "ValueListWithFixedValues -> fd-select/native select"). */
function collectFormFields(facets, out = []) {
  for (const facet of facets || []) {
    if (facet.kind === 'CollectionFacet') collectFormFields(facet.facets, out)
    else if (facet.content?.kind === 'form') {
      for (const col of facet.content.fields) if (col.field) out.push(col.field)
    }
  }
  return out
}

/** Loads everything the Object Page renderer needs for one object: its layout (from the annotation
 *  store), the row (with exactly the columns that layout renders), the child rows of every table
 *  section and, in draft mode, the fixed-value options. Shared by the `GET` route and the SSE
 *  side-effects engine, so a pushed re-render sees the same data a reload would (§4.2). */
async function loadObjectPage(tx, { service, servicePath, entityType, keys, contextPath, appRoot, locale, app, editing = false }) {
  const layout = cache.objectPageFor(cds.model, service, servicePath, entityType, contextPath, { appRoot, locale, app })
  const bundle = cache.bundleFor({ appRoot, locale, app })

  // `keys == null`: an empty object for the create page of a non-draft entity
  const columns = queryLib.objectPageColumns(cds.model, entityType, layout)
  const row = keys ? await tx.run(queryLib.objectPageQuery(entityType, keys, columns)) : {}
  if (!row) return null

  const facets = [...(layout.headerFacets || []), ...(layout.sections || [])]

  let valueLists
  if (row.IsActiveEntity === false || editing) {
    const fixedFields = collectFormFields(facets).filter(f => f.fixedValues && f.valueList)
    if (fixedFields.length) {
      valueLists = {}
      for (const field of fixedFields) valueLists[field.path] = await valueListLib.fixedValueOptions(tx, field.valueList)
    }
  }

  const children = {}
  for (const facet of keys ? collectTableFacets(facets) : []) {
    const { targetEntityType, columns: childFacetColumns, hierarchy } = facet.content
    // A tree table section lists the object's own sub-tree (display mode, an entity composed of itself): the top level is
    // the object's children, deeper levels are fetched when a node is expanded
    if (hierarchy && !editing && row.IsActiveEntity !== false && targetEntityType === entityType && treeLib.isUsable(cds.model, targetEntityType, hierarchy)) {
      const treeLayout = { table: { columns: childFacetColumns, hierarchy }, filterBar: { fields: [] } }
      const top = await treeLib.topLevel(tx, cds.model, targetEntityType, treeLayout, { rootParent: row[hierarchy.nodeProperty], limit: treeLib.LIMIT })
      children[facet.id] = { rows: top.rows, keyNames: keyElements(entityDef(cds.model, targetEntityType)).map(k => k.name), tree: { set: targetEntityType.split('.').pop() } }
      continue
    }
    const childKeyNames = keyElements(entityDef(cds.model, targetEntityType)).map(k => k.name)
    // A non-draft object being edited sends every row of its compositions back with the form (rows that are not in it are deleted
    // on save), so those tables carry all rows; every other table pages like the List Report's: one page, a More row for the rest
    const direct = editing && row.IsActiveEntity !== false
    if (direct) {
      const childLayout = { table: { columns: childFacetColumns }, filterBar: { fields: [] } }
      const childColumns = queryLib.selectColumns(cds.model, targetEntityType, childLayout)
      const childRows = await tx.run(queryLib.objectPageChildQuery(cds.model, entityType, keys, targetEntityType, childColumns))
      children[facet.id] = { rows: childRows, keyNames: childKeyNames }
      continue
    }
    const page = await sectionLib.sectionPage(tx, { parentEntityType: entityType, parentKeys: keys, content: facet.content })
    children[facet.id] = { rows: page.rows, keyNames: childKeyNames, hasMore: page.hasMore, count: page.count, pageSize: page.pageSize }
  }

  return { layout, row, bundle, valueLists, children }
}

module.exports = { loadObjectPage, collectTableFacets, collectFormFields }
