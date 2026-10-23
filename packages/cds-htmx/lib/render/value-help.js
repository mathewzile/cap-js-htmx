const { html } = require('./html')

/** Value help for `@Common.ValueList` associations, measured against the FE reference app:
 *   - the field is an editable input with the value-help icon inside it (F4 or the icon opens the dialog)
 *   - typing shows a small suggestion popup (key + description columns, "Show All Items")
 *   - the dialog is a modal "Select: <label>" with a search field, "Items (n)" and the value list's table
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

/** The rows of the table, one clickable row per value-list entry (`data-value` is what the field gets). */
function valueHelpRows(columns, rows, { valueProp, t }) {
  if (!rows.length) return html`<tr class="hf-table__nodata"><td colspan="${columns.length}">${t('NoData')}</td></tr>`
  return html`${rows.map(row => html`
    <tr class="hf-vh-row" data-value="${row[valueProp] ?? ''}" tabindex="0">
      ${columns.map(col => html`<td>${row[col.prop] ?? ''}</td>`)}
    </tr>`)}`
}

/** Search results only (`hx-target="#vh-results"`): the "Items (n)" title and the table. */
function valueHelpResults(columns, rows, ctx) {
  return html`
    <h3 class="hf-vh__count">${ctx.t('Items')} (${rows.length})</h3>
    <div class="hf-vh__scroll">
      <table class="hf-vh__table" role="table">
        <thead><tr>${columns.map(col => html`<th role="columnheader">${col.label}</th>`)}</tr></thead>
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
  return html`
    <div class="hf-overlay" data-hf-dialog>
      <div class="hf-dialog hf-dialog--value-help" role="dialog" aria-modal="true" aria-labelledby="vh-title" data-hf-path="${field.path}" data-hf-target="${target ?? field.path}">
        <header class="hf-dialog__header"><h2 id="vh-title">${t('Select')}: ${field.label}</h2></header>
        <div class="hf-dialog__body">
          ${searchSupported ? html`
          <form class="hf-vh__search" hx-get="${url}" hx-target="#vh-results" hx-swap="innerHTML" hx-push-url="false" hx-trigger="submit, input delay:300ms">
            <input type="hidden" name="mode" value="results">
            <div class="fd-input-group hf-input-group">
              <input type="search" name="$search" class="fd-input" value="${search ?? ''}" placeholder="${t('Search')}" aria-label="${t('Search')}" data-hf-autofocus autocomplete="off">
              <span class="hf-input-group__addon"><button type="submit" class="fd-button fd-button--compact fd-button--transparent" aria-label="${t('Go')}"><i class="sap-icon--search" aria-hidden="true"></i></button></span>
            </div>
            <button type="submit" class="fd-button fd-button--compact">${t('Go')}</button>
            <button type="button" class="hf-dialog__link" data-hf-vh-filters data-show="${t('ShowFilters')}" data-hide="${t('HideFilters')}" aria-expanded="false">${t('ShowFilters')}</button>
            <div class="hf-vh__filters" hidden>${columns.map(col => html`
              <label class="fd-form-label">${col.label}<input type="text" name="c.${col.prop}" class="fd-input" value="${filters?.[col.prop] ?? ''}" autocomplete="off"></label>`)}</div>
          </form>` : html``}
          <div id="vh-results" class="hf-vh__results" data-value-prop="${valueProp}">${valueHelpResults(columns, rows, { valueProp, t })}</div>
        </div>
        <footer class="hf-dialog__footer"><button type="button" class="fd-button fd-button--transparent" data-hf-dialog-close>${t('Cancel')}</button></footer>
      </div>
    </div>`
}

module.exports = { valueHelpButton, valueHelpDialog, valueHelpResults, valueHelpSuggest }
