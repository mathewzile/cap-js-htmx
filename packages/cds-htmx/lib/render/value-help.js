const { html } = require('./html')

/** Value help for `@Common.ValueList` associations, measured against the FE reference app:
 *   - the field is an editable input with the value-help icon inside it (F4 or the icon opens the dialog)
 *   - typing shows a small suggestion popup (key + description columns, "Show All Items")
 *   - the dialog of a form field is a modal "Select: <label>" with a search field, "Items (n)" and the value list's table;
 *     a row picks the value
 *   - the dialog of a filter field ("<label>", target `f.<path>`) selects several: the Search and Select / Define Conditions tabs,
 *     a checkbox per row, what is selected below the table and OK; the values go into the filter as `a;b`
 *  Fixed-value lists (`Common.ValueListWithFixedValues`) are a `<select>` instead. The page script
 *  (`htmx-fiori.js`) does the picking: it sets the field's input and fires `change`, so a draft PATCHes
 *  and a direct-edit form just holds the value. */

function valueHelpButton(field, { basePath, entitySetPath, t }) {
  return html`
    <button type="button" class="fd-button fd-button--compact fd-button--transparent hf-vh-open"
      hx-get="${basePath}/${entitySetPath}/$vh/${field.path}" hx-target="#dialogs" hx-swap="innerHTML" hx-push-url="false"
      data-hf-suggest-url="${basePath}/${entitySetPath}/$vh/${field.path}"
      aria-haspopup="dialog" aria-label="${t ? t('ValueHelp') : 'Value Help'}" tabindex="-1">
      <i class="sap-icon--value-help" aria-hidden="true"></i>
    </button>`
}

/** The rows of the table, one clickable row per value-list entry (`data-value` is what the field gets). A dialog that selects
 *  several has a checkbox in front of each row. */
function valueHelpRows(columns, rows, { valueProp, t, multi }) {
  if (!rows.length) return html`<tr class="hf-table__nodata"><td colspan="${columns.length + (multi ? 1 : 0)}">${t('NoData')}</td></tr>`
  return html`${rows.map(row => html`
    <tr class="hf-vh-row" data-value="${row[valueProp] ?? ''}" tabindex="0">
      ${multi ? html`<td class="hf-vh__check"><input type="checkbox" class="hf-checkbox" tabindex="-1" aria-label="${t('Select')}"></td>` : html``}
      ${columns.map(col => html`<td>${row[col.prop] ?? ''}</td>`)}
    </tr>`)}`
}

/** Search results only (`hx-target="#vh-results"`): the "Items (n)" title and the table. `col.spec` is what the column's width is
 *  measured from (the page script sizes the columns like FE does). */
function valueHelpResults(columns, rows, ctx) {
  const { multi, t } = ctx
  return html`
    <h3 class="hf-vh__count"><span>${t('Items')} (${rows.length})</span><button type="button" class="fd-button fd-button--transparent hf-icon-button" disabled data-hf-vh-copy aria-label="${t('Copy')}" title="${t('Copy')}"><i class="sap-icon--copy" aria-hidden="true"></i></button></h3>
    <div class="hf-vh__scroll">
      <table class="hf-vh__table" role="table">
        <thead><tr>${multi ? html`<th class="hf-vh__check" role="columnheader"><input type="checkbox" class="hf-checkbox" data-hf-vh-all aria-label="${t('Select')}"></th>` : html``}${columns.map(col => html`<th role="columnheader"${col.spec ? html` data-hf-width="${JSON.stringify(col.spec)}"` : html``}>${col.label}</th>`)}</tr></thead>
        <tbody>${valueHelpRows(columns, rows, ctx)}</tbody>
      </table>
    </div>`
}

/** The type-ahead popup under the input: the value list's columns (the key in brackets in the header, as FE
 *  shows it), the best matches and "Show All Items", which opens the dialog with the typed text. */
function valueHelpSuggest(columns, rows, { valueProp, t }) {
  const heading = col => col.prop === valueProp ? `[${col.label}]` : col.label
  return html`
    <table role="listbox">
      <thead><tr>${columns.map(col => html`<th>${heading(col)}</th>`)}</tr></thead>
      <tbody>${rows.length
        ? rows.map(row => html`<tr class="hf-suggest-row" role="option" data-value="${row[valueProp] ?? ''}">${columns.map(col => html`<td>${row[col.prop] ?? ''}</td>`)}</tr>`)
        : html`<tr><td class="hf-suggest__empty" colspan="${columns.length}">${t('NoData')}</td></tr>`}</tbody>
    </table>
    <button type="button" class="hf-suggest__more" data-hf-show-all>${t('ShowAllItems')}</button>`
}

function valueHelpDialog(field, columns, rows, { basePath, entitySetPath, valueProp, search, searchSupported, t, target, filters }) {
  const url = `${basePath}/${entitySetPath}/$vh/${field.path}?target=${encodeURIComponent(target ?? field.path)}`
  const multi = /^f\./.test(target ?? '')
  return html`
    <div class="hf-overlay" data-hf-dialog>
      <div class="hf-dialog hf-dialog--value-help" role="dialog" aria-modal="true" aria-labelledby="vh-title" data-hf-path="${field.path}" data-hf-target="${target ?? field.path}"${multi ? html` data-hf-multi` : html``}>
        <header class="hf-dialog__header"><h2 id="vh-title">${multi ? field.label : html`${t('Select')}: ${field.label}`}</h2></header>
        ${multi ? html`
        <div class="hf-dialog__tabs" role="tablist">
          <button type="button" class="hf-dialog__tab is-selected" role="tab" aria-selected="true">${t('SearchAndSelect')}</button>
          <button type="button" class="hf-dialog__tab" role="tab" aria-selected="false" data-hf-vh-conditions>${t('DefineConditions')}</button>
        </div>` : html``}
        <div class="hf-dialog__body">
          ${searchSupported ? html`
          <form class="hf-vh__search" hx-get="${url}" hx-target="#vh-results" hx-swap="innerHTML" hx-push-url="false" hx-trigger="submit, input delay:300ms">
            <input type="hidden" name="mode" value="results">
            <div class="fd-input-group hf-input-group">
              <input type="search" name="$search" class="fd-input" value="${search ?? ''}" placeholder="${t('Search')}" aria-label="${t('Search')}" data-hf-autofocus autocomplete="off">
              <span class="hf-input-group__addon"><button type="submit" class="hf-input-icon" aria-label="${t('Go')}"><i class="sap-icon--search" aria-hidden="true"></i></button></span>
            </div>
            <button type="submit" class="fd-button fd-button--compact hf-vh__go">${t('Go')}</button>
            <button type="button" class="hf-dialog__link" data-hf-vh-filters data-show="${t('ShowFilters')}" data-hide="${t('HideFilters')}" aria-expanded="false">${t('ShowFilters')}</button>
            <div class="hf-vh__filters" hidden>${columns.map(col => html`
              <label class="fd-form-label">${col.label}<input type="text" name="c.${col.prop}" class="fd-input" value="${filters?.[col.prop] ?? ''}" autocomplete="off"></label>`)}</div>
          </form>` : html``}
          <div id="vh-results" class="hf-vh__results" data-value-prop="${valueProp}">${valueHelpResults(columns, rows, { valueProp, t, multi })}</div>
          ${multi ? html`
          <div class="hf-vh__selection" data-none="${t('NoItemsSelected')}" data-some="${t('SelectedItems')}">
            <h3 class="hf-vh__selection-title">${t('NoItemsSelected')}</h3>
            <div class="hf-vh__tokens"><span class="hf-vh__token-list"></span><button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-vh-clear hidden aria-label="${t('Clear')}" title="${t('Clear')}"><i class="sap-icon--decline" aria-hidden="true"></i></button></div>
          </div>` : html``}
        </div>
        <footer class="hf-dialog__footer">
          ${multi ? html`<button type="button" class="fd-button fd-button--emphasized" data-hf-vh-ok>${t('OK')}</button>` : html``}
          <button type="button" class="fd-button fd-button--transparent" data-hf-dialog-close>${t('Cancel')}</button>
        </footer>
      </div>
    </div>`
}

module.exports = { valueHelpButton, valueHelpDialog, valueHelpResults, valueHelpSuggest }
