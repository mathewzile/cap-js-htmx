/**
 * FE V4 defaults applied when no FE app manifest exists for a service (or an entity set has no
 * matching routing target in one), per plan §3.2b/§9. A real FE app's manifest `options.settings`
 * always wins over these when present (see `list-report.js`/`object-page.js`).
 */
module.exports = {
  listReport: {
    variantManagement: 'None',
    initialLoad: true,
    table: {
      type: 'ResponsiveTable',
      selectionMode: 'Multi',
      growingThreshold: 20,
      condensedTableLayout: false
    }
  },
  objectPage: {
    editableHeaderContent: true,
    sectionLayout: 'Page'
  }
}
