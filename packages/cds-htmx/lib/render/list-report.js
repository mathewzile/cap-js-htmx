const { html, raw } = require('./html')
const ids = require('./ids')
const { filterBar } = require('./filter-bar')
const { table, rowsHtml, isSelectable } = require('./table')
const { canCreate, canDelete } = require('../model/edit-capabilities')

/** The List Report toolbar (§3.4). Create is a POST that starts a draft (and gets the draft's own URL) for draft
 *  roots and a GET of an empty form for non-draft entities; Create/Delete only appear when the entity allows them.
 *  Original notes: title "{TypeNamePlural} ({count})", spacer, Create (-> `POST`,
 *  navigates into the new draft's OP)/Delete (Delete disabled until the client-side selection
 *  script enables it, §5 `htmx-fiori.js`), and settings icon. */
function toolbar({ typeNamePlural, count, basePath, entitySetPath, bundle, t, edit }) {
  const create = !edit || canCreate(edit)
  const del = !edit || canDelete(edit)
  const draft = !edit || edit.mode === 'draft'
  return html`
    <div id="${ids.lrToolbar()}" class="hf-table-toolbar">
      <h2 class="hf-table-toolbar__title">${typeNamePlural} (<span id="${ids.lrCount()}">${count}</span>)</h2>
      <div class="hf-spacer"></div>
      ${create ? html`<button class="fd-button fd-button--transparent" aria-label="${t(bundle, 'Create')}"
        ${draft
          ? raw(`hx-post="${basePath}/${entitySetPath}" hx-push-url="false"`)
          : raw(`hx-get="${basePath}/${entitySetPath}/$new"`)}
        hx-target="#app" hx-swap="innerHTML show:window:top">${t(bundle, 'Create')}</button>` : html``}
      ${del ? html`<button class="fd-button fd-button--transparent" disabled data-hf-needs-selection="#${ids.lrTableBody()}" aria-label="${t(bundle, 'Delete')}"
        hx-post="${basePath}/${entitySetPath}/$delete" hx-include="#${ids.lrTableBody()}" hx-target="#app" hx-swap="innerHTML show:window:top"
        hx-confirm="${t(bundle, 'ConfirmDeleteSelected')}" data-hf-confirm-count="#${ids.lrTableBody()} .hf-checkbox:checked"
        data-hf-confirm-title="${t(bundle, 'Delete')}" data-hf-confirm-ok="${t(bundle, 'Delete')}" data-hf-confirm-cancel="${t(bundle, 'Cancel')}" data-hf-confirm-critical>${t(bundle, 'Delete')}</button>` : html``}
      <span class="hf-toolbar-separator"></span>
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-action="export" data-hf-export="${basePath}/${entitySetPath}/$export"
        aria-label="${t(bundle, 'ExportCsv')}" title="${t(bundle, 'ExportCsv')}"><i class="sap-icon--excel-attachment" aria-hidden="true"></i></button>
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-action="settings"
        aria-label="${t(bundle, 'ViewSettings')}" title="${t(bundle, 'ViewSettings')}"><i class="sap-icon--action-settings" aria-hidden="true"></i></button>
    </div>
  `
}

/** FE's dynamic-page header expand/collapse + pin buttons, centered on the header's bottom edge. */
function headerToggle() {
  return html`
    <div class="hf-header-toggle">
      <button type="button" class="hf-header-toggle__btn" data-hf-toggle-header aria-label="Collapse Header"><i class="sap-icon--slim-arrow-up" aria-hidden="true"></i></button>
      <button type="button" class="hf-header-toggle__btn" data-hf-pin-header aria-label="Pin Header"><i class="sap-icon--pushpin-off" aria-hidden="true"></i></button>
    </div>`
}

/** Composes the full List Report page (§3.4): dynamic page with variant management, the
 *  collapsible filter-bar header, the toolbar and the table -- or just the table body when this
 *  is a `$table` partial-swap request (sort/search/growing, §routes). */
function listReportFragment(layout, rows, { basePath, entitySetPath, keyNames, count, hasMore, skip, orderBy, query, bundle, t, filterOptions }) {
  const ctx = { basePath, entitySetPath, keyNames, orderBy, skip, hasMore, bundle, t, query }
  return html`
    <div class="hf-page hf-page--lr" data-entity-type="${layout.entityType}" data-hf-set="${entitySetPath}">
      <header class="hf-page__header">
        <div class="hf-page__title">
          <div class="hf-vm hf-popover" id="hf-variants" data-hf-default="${t(bundle, 'Standard')}">
            <button type="button" class="hf-vm__button" data-hf-popover-toggle aria-haspopup="true" aria-expanded="false">
              <span class="hf-vm__title" data-hf-variant-title>${t(bundle, 'Standard')}</span>
              <span class="hf-vm__arrow"><i class="sap-icon--slim-arrow-down" aria-hidden="true"></i></span>
            </button>
            <div class="fd-popover__body"><ul class="hf-popover__list" data-hf-variant-list></ul></div>
          </div>
        </div>
        <div class="hf-page__header-content">
          ${raw(filterBar(layout, { basePath, entitySetPath, query, bundle, t, filterOptions }).value)}
        </div>
        ${headerToggle()}
      </header>
      <div class="hf-page__content">
        <div class="hf-table-card" data-hf-view="lr:${entitySetPath}">
          ${raw(toolbar({ typeNamePlural: layout.header.typeNamePlural, count, basePath, entitySetPath, bundle, t, edit: layout.edit }).value)}
          ${raw(table(layout, rows, ctx).value)}
        </div>
      </div>
    </div>
  `
}

/** `$table` partial response (§routes: `GET /:Set/$table`): the row markup for the requesting
 *  element's own target (sort/search replace `#lr-table-body` wholesale; growing "More" appends),
 *  plus an `<hx-partial>` that refreshes the toolbar count independently of how the main target
 *  was swapped (§htmx 4 guidance: "Prefer `<hx-partial>` tags ... for multi-region updates"). */
function tablePartial(layout, rows, ctx) {
  return html`${raw(rowsHtml(layout, rows, { ...ctx, selectable: isSelectable(layout) }).value)}<hx-partial hx-target="#${ids.lrCount()}" hx-swap="innerHTML">${ctx.count}</hx-partial>`
}

module.exports = { listReportFragment, tablePartial, toolbar }
