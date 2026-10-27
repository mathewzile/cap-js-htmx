const { html, raw } = require('./html')
const { evaluate } = require('../annotations/expressions')
const { criticalityClass, formatAmount, formatNumber, formatBoolean, columnValue } = require('../data/format')
const { valueHelpButton } = require('./value-help')
const { objectStatus } = require('./table')
const ids = require('./ids')

/** A field's display text for one row/object (shared by table cells and Object Page form fields,
 *  §3.4 field renderer table: display-mode only, edit renderers deferred to Phase 5). */
function fieldText(field, row) {
  if (!field?.cqlPath) return ''
  const value = columnValue(row, field.cqlPath)
  if (value == null) return ''
  if (field.currency) return formatAmount(value, evaluate(field.currency, row))
  if (field.unit) return `${formatNumber(value, field)} ${evaluate(field.unit, row) ?? ''}`.trim()
  if (typeof value === 'boolean') return formatBoolean(value)
  return String(value)
}

/** Horizon form label: "Label:" plus a red asterisk for mandatory fields. */
function fieldLabel(text, { mandatory, forId } = {}) {
  return html`<label class="fd-form-label hf-field__label"${forId ? raw(` for="${forId}"`) : html``}><span class="hf-field__label-text">${text}</span>${mandatory ? html`<span class="hf-field__required" aria-hidden="true">*</span>` : html``}</label>`
}

/** `Common.FieldControl` (§3.2 Common): static enum string, numeric legacy value, or a dynamic
 *  expression -- evaluated per row like any other annotation value (§3.1: "expr ... evaluated per
 *  row/object"). `Core.Computed`/`Core.Immutable` fields are always read-only once a draft exists
 *  (immutable fields stay editable only on create, which this minimal pass doesn't distinguish --
 *  listed as a known gap). */
function isReadOnly(field, row, editMode) {
  if (field.computed) return true
  // Core.Immutable: editable only while the object is being created (the create page, or a draft that has no saved version yet)
  const creating = editMode === 'create' || row?.HasActiveEntity === false
  if (field.immutable && !creating) return true
  const fc = evaluate(field.fieldControl, row)
  return fc === 'ReadOnly' || fc === 'Inapplicable' || fc === 1 || fc === 7
}

function isMandatory(field, row) {
  const fc = evaluate(field.fieldControl, row)
  return fc === 'Mandatory' || fc === 7
}

/** The `<input>`/`<textarea>` for one editable field (§3.4 field renderer table). Patches go
 *  straight to the server on change (`PATCH $field/:path`, §routes) -- the side-effects engine
 *  (Phase 6) is what eventually reacts to them; for now the control just round-trips its own value. */
function fieldEditControl(field, row, { basePath, entitySetPath, valueListOptions, id, editMode, source }) {
  const value = row[field.cqlPath]
  // Draft: every change is PATCHed to the draft right away (the response carries the other places
  // that show the same value). Direct/create: plain inputs, the footer's Save sends them all.
  // Never push a URL for a field change: this is not navigation.
  const common = editMode === 'draft' || editMode == null
    ? html`id="${id}" name="${field.path}" hx-patch="${basePath}/${entitySetPath}/$field/${field.path}" hx-trigger="change" hx-include="this" hx-push-url="false" hx-swap="none" hx-headers:inherited:append='{"X-Hf-Source":"${source ?? id.replace(/--input$/, '')}"}'`
    : html`id="${id}" name="${field.path}"`

  if (field.valueList && !field.fixedValues) {
    return html`
      <div class="hf-input-group hf-vh-field">
        <input type="text" class="fd-input" ${common} value="${value ?? ''}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" data-hf-vh-input>
        <span class="hf-input-group__addon">
          ${raw(valueHelpButton(field, { basePath, entitySetPath }).value)}
        </span>
        <div class="hf-suggest" hidden></div>
      </div>`
  }
  if (field.fixedValues && valueListOptions) {
    return html`
      <span class="hf-select">
        <select class="fd-select" ${common}>
          ${valueListOptions.map(opt => html`<option value="${opt.value}" ${String(opt.value) === String(value) ? raw('selected') : html``}>${opt.text}</option>`)}
        </select>
        <i class="sap-icon--slim-arrow-down" aria-hidden="true"></i>
      </span>`
  }
  if (typeof value === 'boolean') {
    return html`<input type="checkbox" class="hf-checkbox" ${common} ${value ? raw('checked') : html``}>`
  }
  if (field.multiline) {
    return html`<textarea class="fd-textarea" ${common}>${value ?? ''}</textarea>`
  }
  return html`<input type="text" class="fd-input${field.numeric || typeof value === 'number' ? ' hf-input--end' : ''}" ${common} value="${value ?? ''}">` // numbers are right-aligned
}

/** The amount and, beside it, the input of the currency (or unit) it is in, as FE edits them. Both patch the draft on their own; a change
 *  of either refreshes the other places that show it, and the wrapper `id` is the source of both so this field is not redrawn under the
 *  cursor (the currency's own field is). */
function amountWithUnit(field, row, { basePath, entitySetPath, valueLists, inputId, id, editMode }) {
  const unit = field.unitField
  return html`<div class="hf-amount-field">
    ${fieldEditControl(field, row, { basePath, entitySetPath, valueListOptions: valueLists?.[field.path], id: inputId, editMode, source: id })}
    <div class="hf-amount-field__unit" data-hf-unit="${unit.path}">${fieldEditControl(unit, row, { basePath, entitySetPath, valueListOptions: valueLists?.[unit.path], id: `${inputId}--unit`, editMode, source: id })}</div>
  </div>`
}

/** A `DataFieldForIntentBasedNavigation` of a form section: a text button in the section's heading row (as FE puts the actions of a
 *  FieldGroup there) that asks the shell to navigate to the intent. The page script (`htmx-fiori.js`) handles the click; without a
 *  launchpad (an adapter with no `navigate`) it shows an error instead. */
const isIntentAction = col => col.kind === 'UI.DataFieldForIntentBasedNavigation'
function intentButton(col) {
  return html`<button type="button" class="fd-button fd-button--transparent hf-intent" data-hf-intent-object="${col.semanticObject}" data-hf-intent-action="${col.action}">${col.label ?? `${col.semanticObject}-${col.action}`}</button>`
}

/** One label/value pair in an Object Page form section (§3.4: "label above value (Horizon),
 *  empty values show '–'"). `facetId` namespaces the field's DOM id for side-effect targeting.
 *  In draft (edit) mode, editable fields render as inputs (§3.4 "inputs replace values"); criticality
 *  status fields and read-only/computed fields stay display-only. */
function formField(col, row, { facetId, isDraft, editMode, basePath, entitySetPath, valueLists } = {}) {
  const editing = !!editMode || !!isDraft
  if (col.hidden && evaluate(col.hidden, row) === true) return html``
  if (isIntentAction(col)) return html`` // it is in the section's heading row, not a form field
  const field = col.field
  if (!field) return html`` // DataFieldForAction/ForAnnotation aren't plain form fields -- their own facet content kind renders them
  const id = ids.opField(facetId ?? '', field.path)
  if (col.criticality) {
    const text = fieldText(field, row)
    const cls = criticalityClass(evaluate(col.criticality, row))
    return html`
      <div class="fd-form-item hf-field" id="${id}">
        ${fieldLabel(field.label)}
        <span class="hf-field__value">${text === '' ? '–' : objectStatus(cls, text)}</span>
      </div>`
  }
  if (editing && field.cqlPath && !isReadOnly(field, row, editMode)) {
    const mandatory = isMandatory(field, row)
    const inputId = `${id}--input`
    return html`
      <div class="fd-form-item hf-field hf-field--edit" id="${id}" data-hf-field="${field.path}">
        ${fieldLabel(field.label, { mandatory, forId: inputId })}
        ${field.unitField && !isReadOnly(field.unitField, row, editMode) ? amountWithUnit(field, row, { basePath, entitySetPath, valueLists, inputId, id, editMode: editMode ?? 'draft' })
          : fieldEditControl(field, row, { basePath, entitySetPath, valueListOptions: valueLists?.[field.path], id: inputId, editMode: editMode ?? 'draft' })}
        <span class="hf-field__message" role="alert"></span>
      </div>`
  }
  const text = fieldText(field, row)
  const display = text === '' ? '–' : text
  return html`
    <div class="fd-form-item hf-field${field.multiline ? ' hf-field--multiline' : ''}" id="${id}">
      ${fieldLabel(field.label)}
      <span class="hf-field__value">${display}</span>
    </div>`
}

module.exports = { fieldText, fieldLabel, formField, isIntentAction, intentButton, isMandatory, isReadOnly }
