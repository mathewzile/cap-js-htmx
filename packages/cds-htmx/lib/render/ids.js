/** Deterministic DOM ids for List Report / Object Page markup (§1 repo layout), so htmx targets
 *  (`hx-target="#..."`), SSE side-effect partials and tests can address an element without
 *  depending on render order. Paths (`author/name`) are slash-joined rather than dot-joined so an
 *  id never collides with the CQL-dotted form used elsewhere, and stays a single CSS-selector-safe
 *  token (no brackets/parens from OData key syntax). */

const { AsyncLocalStorage } = require('node:async_hooks')

/** In a Flexible Column Layout two Object Pages can be on screen at once (a page and its sub-object page), so the ids
 *  of the third column carry a prefix (`c2-op-page`): partials, labels and anchors then address one page only. The
 *  prefix belongs to the request (or push) that renders, not to a module global. */
const scope = new AsyncLocalStorage()
const prefix = () => scope.getStore()?.prefix ?? ''
const prefixOf = column => column >= 2 ? `c${column}-` : ''

/** Runs `fn` with the ids of FCL column `column` (0 List Report, 1 Object Page, 2 sub-object page, ...). */
const inColumn = (column, fn) => scope.run({ prefix: prefixOf(column) }, fn)

/** Switches the current scope to the column of the page about to be rendered (no scope = no FCL = nothing to do). */
function setColumn(column) {
  const store = scope.getStore()
  if (store) store.prefix = prefixOf(column)
}

/** An id as the client sent it back (`X-Hf-Source`), without the column prefix. */
const unprefixed = id => String(id).replace(/^c\d+-/, '')

function sanitize(token) {
  return String(token).replace(/[^A-Za-z0-9_-]/g, '-')
}

const lrTable = () => 'lr-table'
const lrTableBody = () => 'lr-table-body'
const lrFilterBar = () => 'lr-filter-bar'
const lrToolbar = () => 'lr-toolbar'
const lrCount = () => 'lr-count'
const lrGrowing = () => 'lr-growing'
const lrRow = key => `lr-row--${sanitize(key)}`
const lrColumnSort = path => `lr-sort--${sanitize(path)}`

const opSection = id => `${prefix()}op-section--${sanitize(id)}`
const opField = (facetId, path) => `${prefix()}op-field--${sanitize(facetId)}--${sanitize(path)}`
const opHeaderFacet = id => `${prefix()}op-hfacet--${sanitize(id)}`
const opAnchor = () => `${prefix()}op-anchor`
const opHeader = () => `${prefix()}op-header`
const opPage = () => `${prefix()}op-page`
const opTitle = () => `${prefix()}op-title`
const opMessages = () => `${prefix()}op-messages`
const opDraftStatus = () => `${prefix()}op-draft-status`
const opFooter = () => `${prefix()}op-footer`
const messages = () => 'messages'
const toast = () => 'toast'

module.exports = { inColumn, setColumn, unprefixed, sanitize, lrTable, lrTableBody, lrFilterBar, lrToolbar, lrCount, lrGrowing, lrRow, lrColumnSort, opSection, opField, opHeaderFacet, opAnchor, opHeader, opPage, opTitle, opMessages, opDraftStatus, opFooter, messages, toast }
