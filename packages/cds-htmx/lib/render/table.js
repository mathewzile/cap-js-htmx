const { html, raw } = require('./html')
const { evaluate } = require('../annotations/expressions')
const { criticalityClass, criticalityIcon, formatAmount, formatNumber, formatBoolean, columnValue } = require('../data/format')
const { formatKeys } = require('../keys')
const ids = require('./ids')

/** A `UI.DataField`-shaped column's display text for one row. Columns whose `Value` isn't a plain
 *  `$Path` (`col.field.expr`, §list-report.js `valueField()`) have no single property to read --
 *  out of scope for the first rendering pass (`UI.DataFieldForAction`/`ForAnnotation` likewise
 *  render as an action/annotation reference, not a value cell, handled separately below). */
function cellText(col, row) {
  const field = col.field
  if (!field?.cqlPath) return ''
  const value = columnValue(row, field.cqlPath)
  if (value == null) return ''
  if (field.currency) return formatAmount(value, evaluate(field.currency, row))
  if (field.unit) return `${formatNumber(value, field)} ${evaluate(field.unit, row) ?? ''}`.trim()
  if (typeof value === 'boolean') return formatBoolean(value)
  return String(value)
}

/** FE right-aligns numeric columns (header and cells); the type is taken from the fetched values. */
function isNumericColumn(col, rows) {
  const path = col.field?.cqlPath
  if (!path) return false
  if (col.field.currency || col.field.unit) return true
  const sample = rows.map(r => columnValue(r, path)).find(v => v != null)
  return typeof sample === 'number'
}

const REM = 16
const IMPORTANCE_RANK = { High: 0, Medium: 1, None: 1, Low: 2 }

function importanceRank(importance) {
  const value = typeof importance === 'object' ? importance?.$EnumMember : importance
  return IMPORTANCE_RANK[String(value ?? 'None').split('/').pop()] ?? 1
}

/** `HTML5.CssDefaults.width` in px, if given in rem/em/px. */
function cssWidthPx(width) {
  const m = /^\s*([\d.]+)\s*(rem|em|px)\s*$/.exec(width ?? '')
  if (!m) return undefined
  return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * REM
}

/** Mimics UI5's `autoPopinMode`: columns ranked by `UI.Importance` (then column order) accumulate
 *  their estimated width; a column is hidden once the table is narrower than that running total.
 *  Returns the minimum table width per column index (`undefined` = always visible). */
function columnBreakpoints(columns, rows, { selectable = true } = {}) {
  let total = (selectable ? 2 : 0) * REM + 2.75 * REM // selection + navigation columns
  const order = columns
    .map((col, i) => ({ col, i, rank: importanceRank(col.importance) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
  const result = []
  for (const { col, i } of order) {
    total += cssWidthPx(col.width ?? col.field?.width) ?? (isNumericColumn(col, rows) ? 6 : 18) * REM
    result[i] = i === 0 ? undefined : Math.round(total)
  }
  return result
}

/** Scoped container-query rules hiding the columns `columnBreakpoints()` drops on narrow tables. */
function columnVisibilityStyle(scope, columns, rows, opts) {
  const rules = columnBreakpoints(columns, rows, opts)
    .map((min, i) => min && `@container hf-table (max-width: ${min - 1}px) { ${scope} .hf-col-${i} { display: none; } }`)
    .filter(Boolean)
  return rules.length ? html`<style>${raw(rules.join('\n'))}</style>` : html``
}

function keyValues(keyNames, row) {
  const keys = {}
  for (const name of keyNames) keys[name] = row[name]
  return keys
}

function rowHref(basePath, entitySet, keyNames, row) {
  return `${basePath}/${entitySet}(${formatKeys(keyValues(keyNames, row))})`
}

/** FE's criticality-colored `ObjectStatus` (icon + colored text). */
function objectStatus(cls, text) {
  if (!cls) return html`${text}`
  const icon = criticalityIcon(cls)
  return html`<span class="fd-object-status fd-object-status--${cls}">${icon ? html`<i class="fd-object-status__icon sap-icon--${icon}" role="presentation" aria-hidden="true"></i>` : html``}<span class="fd-object-status__text">${text}</span></span>`
}

function checkbox(label) {
  return html`<input type="checkbox" class="hf-checkbox" aria-label="${label}">`
}

function headerCell(col, { basePath, entitySetPath, orderBy, numeric, sortable, index }) {
  const cls = `fd-table__cell hf-th hf-col-${index}${numeric ? ' hf-cell--end' : ''}`
  if (!sortable || !col.field?.cqlPath || col.kind !== 'UI.DataField') {
    return html`<th class="${cls}" role="columnheader"><span class="hf-th__text">${col.label ?? col.field?.label ?? ''}</span></th>`
  }
  const path = col.field.cqlPath
  const isCurrent = orderBy?.path === path
  const nextDesc = isCurrent ? !orderBy.desc : false
  const sortParam = `${path}${nextDesc ? ' desc' : ''}`
  return html`<th class="${cls}" role="columnheader" ${isCurrent ? raw(`aria-sort="${orderBy.desc ? 'descending' : 'ascending'}"`) : html``}>
    <a class="hf-th__text hf-th__sort" href="#"
       hx-get="${basePath}/${entitySetPath}/$table?$orderby=${encodeURIComponent(sortParam)}"
       hx-target="#${ids.lrTableBody()}" hx-swap="innerHTML">${col.label}${isCurrent ? html` <i class="sap-icon--${orderBy.desc ? 'sort-descending' : 'sort-ascending'}" aria-hidden="true"></i>` : html``}</a>
  </th>`
}

function dataCell(col, row, { bundle, t, isFirst, numeric, index } = {}) {
  const cls = `fd-table__cell hf-col-${index}${numeric ? ' hf-cell--end' : ''}`
  if (col.hidden && evaluate(col.hidden, row) === true) return html`<td class="${cls}"></td>`
  if (col.kind === 'UI.DataFieldForAction' || col.kind === 'UI.DataFieldForAnnotation') {
    return html`<td class="${cls}"></td>` // toolbar/inline actions and DataPoint/Chart cells: Phase 4+ (object page) territory for the rendering, revisited for inline table use later
  }
  const text = cellText(col, row)
  const badge = isFirst ? draftStatusBadge(row, bundle, t) : html``
  const crit = col.criticality ? criticalityClass(evaluate(col.criticality, row)) : ''
  return html`<td class="${cls}">${objectStatus(crit, text)}${raw(badge.value)}</td>`
}

/** A draft-root row's "Draft" (own draft shown in place of the active row, FE's "All" default view)
 *  or "Locked" (another draft exists on this active row) status, under the first column (§3.4 List
 *  Report checklist). Simplified vs. FE: shows "Locked by Another User" generically rather than the
 *  actual lock-holder's name, since that needs a `DraftAdministrativeData` expand the generic-service
 *  auth layer rejects for multi-segment nav paths (`"Navigation ... in expand is not supported"`,
 *  verified live) -- listed as a known deviation. */
function draftStatusBadge(row, bundle, t) {
  if (!bundle) return html``
  if (row.IsActiveEntity === false) {
    return html`<div class="hf-draft-indicator"><span class="fd-object-status fd-object-status--informative">${t(bundle, 'Draft')}</span></div>`
  }
  if (row.HasDraftEntity === true) {
    return html`<div class="hf-draft-indicator"><span class="fd-object-status fd-object-status--informative">${t(bundle, 'LockedByAnotherUser')}</span></div>`
  }
  return html``
}

function rowMarkup(layout, row, { basePath, entitySetPath, keyNames, bundle, t, numeric, selectable }) {
  const href = rowHref(basePath, entitySetPath, keyNames, row)
  return html`
    <tr class="fd-table__row fd-table__row--activable fd-table__row--hoverable"
        hx-get="${href}" hx-trigger="click[!event.target.closest('.fd-table__cell--checkbox')]">
      ${selectable ? html`<td class="fd-table__cell fd-table__cell--checkbox">${checkbox('Select row')}</td>` : html``}
      ${layout.table.columns.map((col, i) => dataCell(col, row, { bundle, t, isFirst: i === 0, numeric: numeric[i], index: i }))}
      <td class="fd-table__cell hf-col-nav">
        <i class="sap-icon--slim-arrow-right" aria-hidden="true"></i>
      </td>
    </tr>`
}

/** Renders just the `<tr>` rows (no wrapping `<tbody>`) -- used both inline in the full table and
 *  as the `$table` partial-swap payload for sort/search/growing (§routes: `GET /:Set/$table`),
 *  where the requesting element targets `#lr-table-body` directly with `innerHTML` (replace, for
 *  sort/search/Go) or `beforeend` (append, for growing "More"). */
function rowsHtml(layout, rows, { basePath, entitySetPath, keyNames, bundle, t, selectable = true }) {
  if (!rows.length) {
    return html`<tr class="hf-table__nodata"><td class="fd-table__cell" colspan="${layout.table.columns.length + (selectable ? 2 : 1)}">${t(bundle, 'NoDataFound')}</td></tr>`
  }
  const numeric = layout.table.columns.map(col => isNumericColumn(col, rows))
  return html`${rows.map(row => rowMarkup(layout, row, { basePath, entitySetPath, keyNames, bundle, t, numeric, selectable }))}`
}

function growingButton(basePath, entitySetPath, { skip, hasMore, bundle, t, query }) {
  if (!hasMore) return html``
  const params = new URLSearchParams({ ...query, $skip: String(skip) })
  return html`
    <div class="hf-table__growing">
      <button class="hf-table__growing-button"
        hx-get="${basePath}/${entitySetPath}/$table?${params.toString()}"
        hx-target="#${ids.lrTableBody()}" hx-swap="beforeend">
        ${t(bundle, 'More')}
      </button>
    </div>`
}

/** Header row shared by the List Report table and Object Page table sections. */
function tableHead(columns, rows, { basePath, entitySetPath, orderBy, selectable = true, sortable = true } = {}) {
  return html`
    <thead>
      <tr class="fd-table__row" role="row">
        ${selectable ? html`<th class="fd-table__cell fd-table__cell--checkbox" role="columnheader">${checkbox('Select all')}</th>` : html``}
        ${columns.map((col, index) => headerCell(col, { basePath, entitySetPath, orderBy, sortable, index, numeric: isNumericColumn(col, rows) }))}
        <th class="fd-table__cell hf-col-nav" role="columnheader"></th>
      </tr>
    </thead>`
}

/** The `fd-table` itself (§3.4 List Report checklist): checkbox column, sortable header cells,
 *  activable/hoverable rows with a navigation arrow cell. */
function table(layout, rows, ctx) {
  const { basePath, entitySetPath, orderBy } = ctx
  return html`
    ${columnVisibilityStyle(`#${ids.lrTable()}`, layout.table.columns, rows)}
    <table id="${ids.lrTable()}" class="fd-table hf-table" role="table">
      ${tableHead(layout.table.columns, rows, { basePath, entitySetPath, orderBy })}
      <tbody id="${ids.lrTableBody()}">${raw(rowsHtml(layout, rows, ctx).value)}</tbody>
    </table>
    ${growingButton(basePath, entitySetPath, ctx)}
  `
}

module.exports = { table, tableHead, rowsHtml, cellText, rowHref, keyValues, objectStatus, columnBreakpoints, columnVisibilityStyle }
