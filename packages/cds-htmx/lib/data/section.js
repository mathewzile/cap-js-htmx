const cds = require('@sap/cds')
const queryLib = require('./query')
const filtersLib = require('./filters')

/** The rows of an Object Page table section, one page of them, the way the List Report reads its table: the section's own
 *  `PresentationVariant` (sort order, `MaxItems` as the page size), `$search` over the columns, `$orderby` from the column
 *  menu, `$skip` for the next page, a total for the title and the `[ loaded / total ]` of the More button.
 *  Returns `{ rows, hasMore, count, pageSize }`; `content` is the facet's table content (`model/object-page.js`). */
async function sectionPage(tx, { parentEntityType, parentKeys, content, query = {}, skip = 0, limit }) {
  const { targetEntityType } = content
  const layout = { table: { columns: content.columns, sortOrder: content.sortOrder, growingThreshold: content.growingThreshold }, filterBar: { fields: [] } }
  const pageSize = limit ?? content.growingThreshold
  const filters = queryLib.parentFilter(cds.model, parentEntityType, parentKeys, targetEntityType)
  const search = filtersLib.parseSearch(query)
  const [found, counted] = await Promise.all([
    // a total order (the keys break ties) so that no row repeats or goes missing between pages
    tx.run(queryLib.listReportQuery(cds.model, targetEntityType, targetEntityType, layout, { filters, search, query, skip, limit: pageSize, tieBreak: true })),
    tx.run(queryLib.listReportCountQuery(targetEntityType, { filters, search }))
  ])
  const hasMore = found.length > pageSize
  return { rows: hasMore ? found.slice(0, pageSize) : found, hasMore, count: counted.count, pageSize }
}

module.exports = { sectionPage }
