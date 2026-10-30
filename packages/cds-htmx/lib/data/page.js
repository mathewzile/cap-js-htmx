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
async function loadObjectPage(tx, { service, servicePath, entityType, keys, contextPath, appRoot, locale, app, editing = false, need }) {
  const layout = cache.objectPageFor(cds.model, service, servicePath, entityType, contextPath, { appRoot, locale, app })
  const bundle = cache.bundleFor({ appRoot, locale, app })

  // `keys == null`: an empty object for the create page of a non-draft entity
  const columns = queryLib.objectPageColumns(cds.model, entityType, layout)
  const facets = [...(layout.headerFacets || []), ...(layout.sections || [])]
  const draft = keys?.IsActiveEntity === false || editing

  // Everything that does not depend on the row is requested together with it: the statements of a transaction go to the
  // database one after another, but they no longer wait for each other's answer to be processed
  const rowPromise = keys ? tx.run(queryLib.objectPageQuery(entityType, keys, columns)) : Promise.resolve({})

  // `need` (a side-effect refresh): only the sections and fixed-value fields that will be re-rendered
  const fixedFields = draft ? collectFormFields(facets).filter(f => f.fixedValues && f.valueList && (!need || need.fields.has(f.path))) : []
  const valueListsPromise = Promise.all(fixedFields.map(field => valueListLib.fixedValueOptions(tx, field.valueList)))

  const wanted = keys ? collectTableFacets(facets).filter(facet => !need || need.sections.has(facet.id)) : []
  const isTree = facet => { const { hierarchy, targetEntityType } = facet.content; return hierarchy && !editing && targetEntityType === entityType && treeLib.isUsable(cds.model, targetEntityType, hierarchy) }
  const sectionPromises = wanted.filter(facet => !isTree(facet) || keys.IsActiveEntity === false)
    .map(facet => sectionLib.sectionPage(tx, { parentEntityType: entityType, parentKeys: keys, content: facet.content }).then(page => [facet, page]))

  const [row, lists, sections] = await Promise.all([rowPromise, valueListsPromise, Promise.all(sectionPromises)])
  if (!row) return null

  let valueLists
  if (fixedFields.length && (row.IsActiveEntity === false || editing)) {
    valueLists = Object.fromEntries(fixedFields.map((field, i) => [field.path, lists[i]]))
  }

  const children = {}
  const keyNamesOf = type => keyElements(entityDef(cds.model, type)).map(k => k.name)
  for (const [facet, page] of sections) {
    children[facet.id] = { rows: page.rows, keyNames: keyNamesOf(facet.content.targetEntityType), hasMore: page.hasMore, count: page.count, pageSize: page.pageSize }
  }
  // A tree table section lists the object's own sub-tree (display mode, an entity composed of itself): the top level is
  // the object's children, deeper levels are fetched when a node is expanded. It needs the row (the node it hangs below)
  const trees = wanted.filter(facet => isTree(facet) && row.IsActiveEntity !== false)
  await Promise.all(trees.map(async facet => {
    const { targetEntityType, columns: childFacetColumns, hierarchy } = facet.content
    const treeLayout = { table: { columns: childFacetColumns, hierarchy }, filterBar: { fields: [] } }
    const top = await treeLib.topLevel(tx, cds.model, targetEntityType, treeLayout, { rootParent: row[hierarchy.nodeProperty], limit: treeLib.LIMIT })
    children[facet.id] = { rows: top.rows, keyNames: keyNamesOf(targetEntityType), tree: { set: targetEntityType.split('.').pop() } }
  }))

  return { layout, row, bundle, valueLists, children }
}

/** The table sections (and table header facets) of an Object Page layout, in page order. */
const tableFacets = layout => collectTableFacets([...(layout.headerFacets || []), ...(layout.sections || [])])

module.exports = { loadObjectPage, collectTableFacets, collectFormFields, tableFacets }
