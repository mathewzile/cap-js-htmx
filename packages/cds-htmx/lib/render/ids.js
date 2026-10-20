/** Deterministic DOM ids for List Report / Object Page markup (§1 repo layout), so htmx targets
 *  (`hx-target="#..."`), SSE side-effect partials and tests can address an element without
 *  depending on render order. Paths (`author/name`) are slash-joined rather than dot-joined so an
 *  id never collides with the CQL-dotted form used elsewhere, and stays a single CSS-selector-safe
 *  token (no brackets/parens from OData key syntax). */

function sanitize(token) {
  return String(token).replace(/[^A-Za-z0-9_-]/g, '-')
}

const lrTable = () => 'lr-table'
const lrTableBody = () => 'lr-table-body'
const lrFilterBar = () => 'lr-filter-bar'
const lrToolbar = () => 'lr-toolbar'
const lrCount = () => 'lr-count'
const lrRow = key => `lr-row--${sanitize(key)}`
const lrColumnSort = path => `lr-sort--${sanitize(path)}`

const opSection = id => `op-section--${sanitize(id)}`
const opField = (facetId, path) => `op-field--${sanitize(facetId)}--${sanitize(path)}`
const opHeader = () => 'op-header'
const opPage = () => 'op-page'
const opTitle = () => 'op-title'
const opFooter = () => 'op-footer'
const messages = () => 'messages'
const toast = () => 'toast'

module.exports = { sanitize, lrTable, lrTableBody, lrFilterBar, lrToolbar, lrCount, lrRow, lrColumnSort, opSection, opField, opHeader, opPage, opTitle, opFooter, messages, toast }
