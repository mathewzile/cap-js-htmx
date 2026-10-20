const { html, raw } = require('./html')
const ids = require('./ids')
const { filterBar } = require('./filter-bar')
const { table, rowsHtml } = require('./table')

/** The List Report toolbar (§3.4): title "{TypeNamePlural} ({count})", spacer, Create (-> `POST`,
 *  navigates into the new draft's OP)/Delete (Delete disabled until the client-side selection
 *  script enables it, §5 `htmx-fiori.js`), and settings icon. */
function toolbar({ typeNamePlural, count, basePath, entitySetPath, bundle, t }) {
  return html`
    <div id="${ids.lrToolbar()}" class="hf-table-toolbar">
      <h2 class="hf-table-toolbar__title">${typeNamePlural} (<span id="${ids.lrCount()}">${count}</span>)</h2>
      <div class="hf-spacer"></div>
      <button class="fd-button fd-button--transparent" aria-label="${t(bundle, 'Create')}"
        hx-post="${basePath}/${entitySetPath}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">${t(bundle, 'Create')}</button>
      <button class="fd-button fd-button--transparent" disabled aria-label="${t(bundle, 'Delete')}">${t(bundle, 'Delete')}</button>
      <span class="hf-toolbar-separator"></span>
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" aria-label="Settings" title="Settings"><i class="sap-icon--action-settings" aria-hidden="true"></i></button>
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
    <div class="hf-page hf-page--lr" data-entity-type="${layout.entityType}">
      <header class="hf-page__header">
        <div class="hf-page__title">
          <div class="hf-vm">
            <h2 class="hf-vm__title">${t(bundle, 'Standard')}</h2>
            <span class="hf-vm__arrow"><i class="sap-icon--slim-arrow-down" aria-hidden="true"></i></span>
          </div>
        </div>
        <div class="hf-page__header-content">
          ${raw(filterBar(layout, { basePath, entitySetPath, query, bundle, t, filterOptions }).value)}
        </div>
        ${headerToggle()}
      </header>
      <div class="hf-page__content">
        <div class="hf-table-card">
          ${raw(toolbar({ typeNamePlural: layout.header.typeNamePlural, count, basePath, entitySetPath, bundle, t }).value)}
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
  return html`${raw(rowsHtml(layout, rows, ctx).value)}<hx-partial hx-target="#${ids.lrCount()}" hx-swap="innerHTML">${ctx.count}</hx-partial>`
}

module.exports = { listReportFragment, tablePartial, toolbar }
