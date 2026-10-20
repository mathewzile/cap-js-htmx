const { html } = require('./html')

/** Value help for `@Common.ValueList` associations (design check against the FE reference app: F4 /
 *  the icon opens a modal "Select: <label>" dialog with a search field, an "Items (n)" table of the
 *  value list's columns and Cancel; clicking a row writes its key into the field and closes).
 *  Fixed-value lists (`Common.ValueListWithFixedValues`) are a `<select>` instead. The page script
 *  (`htmx-fiori.js`) does the selecting: it sets the field's input and fires `change`, so a draft PATCHes
 *  and a direct-edit form just holds the value. */

function valueHelpButton(field, { basePath, entitySetPath, t }) {
  return html`
    <button type="button" class="fd-button fd-button--compact fd-button--transparent hf-vh-open"
      hx-get="${basePath}/${entitySetPath}/$vh/${field.path}" hx-target="#dialogs" hx-swap="innerHTML" hx-push-url="false"
      aria-haspopup="dialog" aria-label="${t ? t('ValueHelp') : 'Value Help'}">
      <i class="sap-icon--value-help" aria-hidden="true"></i>
    </button>`
}

/** The rows of the table, one clickable row per value-list entry (`data-value` is what the field gets). */
function valueHelpRows(columns, rows, { valueProp, t }) {
  if (!rows.length) return html`<tr class="hf-table__nodata"><td class="fd-table__cell" colspan="${columns.length}">${t('NoDataFound')}</td></tr>`
  return html`${rows.map(row => html`
    <tr class="fd-table__row fd-table__row--activable fd-table__row--hoverable hf-vh-row" data-value="${row[valueProp] ?? ''}" tabindex="0">
      ${columns.map(col => html`<td class="fd-table__cell">${row[col.prop] ?? ''}</td>`)}
    </tr>`)}`
}

/** Search results only (`hx-target="#vh-results"`): the "Items (n)" title and the table. */
function valueHelpResults(columns, rows, ctx) {
  return html`
    <h3 class="fd-title fd-title--h5 hf-vh__count">${ctx.t('Items')} (${rows.length})</h3>
    <div class="hf-vh__scroll">
      <table class="fd-table hf-table hf-vh__table" role="table">
        <thead><tr class="fd-table__row">${columns.map(col => html`<th class="fd-table__cell hf-th" role="columnheader"><span class="hf-th__text">${col.label}</span></th>`)}</tr></thead>
        <tbody>${valueHelpRows(columns, rows, ctx)}</tbody>
      </table>
    </div>`
}

function valueHelpDialog(field, columns, rows, { basePath, entitySetPath, valueProp, search, searchSupported, t, target }) {
  const url = `${basePath}/${entitySetPath}/$vh/${field.path}?target=${encodeURIComponent(target ?? field.path)}`
  return html`
    <div class="hf-overlay" data-hf-dialog>
      <div class="hf-dialog" role="dialog" aria-modal="true" aria-labelledby="vh-title" data-hf-path="${field.path}" data-hf-target="${target ?? field.path}">
        <header class="hf-dialog__header"><h2 class="fd-title fd-title--h5" id="vh-title">${t('Select')}: ${field.label}</h2></header>
        <div class="hf-dialog__body">
          ${searchSupported ? html`
          <form class="hf-vh__search" hx-get="${url}" hx-target="#vh-results" hx-swap="innerHTML" hx-push-url="false" hx-trigger="submit, input delay:300ms">
            <div class="fd-input-group hf-input-group">
              <input type="search" name="$search" class="fd-input" value="${search ?? ''}" placeholder="${t('Search')}" aria-label="${t('Search')}" data-hf-autofocus autocomplete="off">
              <span class="hf-input-group__addon"><button type="submit" class="fd-button fd-button--compact fd-button--transparent" aria-label="${t('Go')}"><i class="sap-icon--search" aria-hidden="true"></i></button></span>
            </div>
            <button type="submit" class="fd-button fd-button--compact">${t('Go')}</button>
          </form>` : html``}
          <div id="vh-results" data-value-prop="${valueProp}">${valueHelpResults(columns, rows, { valueProp, t })}</div>
        </div>
        <footer class="hf-dialog__footer"><button type="button" class="fd-button fd-button--transparent" data-hf-dialog-close>${t('Cancel')}</button></footer>
      </div>
    </div>`
}

module.exports = { valueHelpButton, valueHelpDialog, valueHelpResults }
