const { html, raw } = require('./html')
const ids = require('./ids')

/** Value-help dialog for `@Common.ValueList` associations (unbounded, searchable picker).
 *  Distinguishes from fixed-values (Common.ValueListWithFixedValues), which render as `<select>`. */

function valueHelpButton(field, { basePath, entitySetPath }) {
  return html`
    <button class="fd-button fd-button--compact"
      hx-get="${basePath}/${entitySetPath}/$vh/${field.path}"
      hx-target="#vh-dialog-${field.path}"
      hx-swap="innerHTML"
      aria-label="Open value help">
      <i class="sap-icon--search" aria-hidden="true"></i>
    </button>`
}

/** Renders value-help dialog for a field with searchable list of collection rows.
 *  Returns dialog markup + embedded table of options from the collection. */
function valueHelpDialog(field, options, { basePath, entitySetPath, collectionPath, valueProp, textProp } = {}) {
  if (!options) return html``
  const dialogId = `vh-dialog-${field.path}`
  const searchFieldId = `vh-search-${field.path}`
  const tableId = `vh-table-${field.path}`

  return html`
    <div id="${dialogId}" class="fd-dialog" role="dialog">
      <div class="fd-dialog__content">
        <header class="fd-dialog__header">
          <h2 class="fd-dialog__title">${field.label} - Value Help</h2>
          <button class="fd-button fd-button--compact fd-dialog__close"
            hx-get="#" hx-swap="delete"
            aria-label="Close">
            <i class="sap-icon--decline" aria-hidden="true"></i>
          </button>
        </header>

        <div class="fd-dialog__body">
          <div class="fd-form-item">
            <label class="fd-form-label" for="${searchFieldId}">Search</label>
            <div class="fd-input-group">
              <input id="${searchFieldId}" type="text" class="fd-input"
                hx-get="${basePath}/${entitySetPath}/$vh/${field.path}"
                hx-trigger="input delay:300ms"
                hx-target="#${tableId}"
                hx-swap="innerHTML"
                placeholder="Type to search">
              <span class="fd-input-group__addon fd-input-group__addon--button">
                <i class="sap-icon--search" aria-hidden="true"></i>
              </span>
            </div>
          </div>

          <table id="${tableId}" class="fd-table fd-table--compact" role="table">
            <thead>
              <tr class="fd-table__row" role="row">
                <th class="fd-table__cell" role="columnheader">${field.label}</th>
                ${textProp !== valueProp ? html`<th class="fd-table__cell" role="columnheader">Description</th>` : html``}
              </tr>
            </thead>
            <tbody>
              ${options.map(opt => html`
                <tr class="fd-table__row" role="row"
                  hx-post="${basePath}/${entitySetPath}/$field/${field.path}"
                  hx-vals='{"${field.path}": "${opt.value}"}'
                  hx-target="#${dialogId}"
                  hx-swap="delete"
                  style="cursor: pointer;">
                  <td class="fd-table__cell">${opt.value}</td>
                  ${textProp !== valueProp ? html`<td class="fd-table__cell">${opt.text}</td>` : html``}
                </tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </div>`
}

module.exports = { valueHelpButton, valueHelpDialog }
