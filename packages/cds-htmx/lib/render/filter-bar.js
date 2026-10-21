const { html, raw } = require('./html')
const ids = require('./ids')

/** One filter-bar field: label above input (Horizon convention, §3.4 `form-item.md`). Fixed-value
 *  lists render as a select, other value lists as an input with a value-help icon (FE look); all
 *  other types stay plain text inputs. */
/** A date filter restricted to one value or one range (`Capabilities.FilterRestrictions/FilterExpressionRestrictions`
 *  `SingleValue`/`SingleRange`) is a date picker, as in FE: the browser's own calendar popup in an input of the
 *  Fiori look. A range is one control holding "from – to"; it sends `f.<path>.ge` and `f.<path>.le`. (A
 *  `DateTimeOffset` property with these restrictions stays a text field for now.) */
function datePicker(field, query, id, name) {
  if (field.filterExpression === 'SingleValue') {
    return html`<input id="${id}" name="${name}" type="date" class="fd-input hf-date-input" value="${query?.[name] ?? ''}" data-hf-picker="value">`
  }
  return html`
    <div class="fd-input hf-date-range" role="group" aria-labelledby="${id}--label" data-hf-picker="range">
      <input id="${id}" name="${name}.ge" type="date" class="hf-date-range__input" value="${query?.[`${name}.ge`] ?? ''}" aria-label="${field.label} (from)">
      <span class="hf-date-range__dash" aria-hidden="true">–</span>
      <input name="${name}.le" type="date" class="hf-date-range__input" value="${query?.[`${name}.le`] ?? ''}" aria-label="${field.label} (to)">
    </div>`
}

const isDatePicker = field => field.edmType === 'Edm.Date' && (field.filterExpression === 'SingleValue' || field.filterExpression === 'SingleRange')

function filterField(field, query, options, ctx) {
  const name = `f.${field.path}`
  const id = ids.sanitize(name)
  const value = query?.[name] ?? ''
  let control
  if (isDatePicker(field)) {
    control = datePicker(field, query, id, name)
  } else if (field.fixedValues && options) {
    control = html`
      <span class="hf-select">
        <select id="${id}" name="${name}" class="fd-select">
          <option value=""></option>
          ${options.map(opt => html`<option value="${opt.value}" ${String(opt.value) === String(value) ? raw('selected') : html``}>${opt.text}</option>`)}
        </select>
        <i class="sap-icon--slim-arrow-down" aria-hidden="true"></i>
      </span>`
  } else {
    // FE offers its condition value help on every free-text filter field
    control = html`
      <div class="hf-input-group">
        <input id="${id}" name="${name}" type="text" class="fd-input" value="${value}">
        <span class="hf-input-group__addon">${field.valueList && ctx?.basePath ? html`
          <button type="button" class="fd-button fd-button--compact fd-button--transparent hf-vh-open" aria-haspopup="dialog" aria-label="Value Help"
            hx-get="${ctx.basePath}/${ctx.entitySetPath}/$vh/${field.path}?target=${encodeURIComponent(name)}" hx-target="#dialogs" hx-swap="innerHTML" hx-push-url="false"><i class="sap-icon--value-help" aria-hidden="true"></i></button>` : html`
          <button type="button" class="fd-button fd-button--compact fd-button--transparent" data-hf-action="conditions" aria-haspopup="dialog" aria-label="Define Conditions"><i class="sap-icon--value-help" aria-hidden="true"></i></button>`}</span>
      </div>`
  }
  return html`
    <div class="fd-form-item hf-filter" data-hf-filter="${field.path}" data-hf-label="${field.label}"${field.edmType === 'Edm.Date' ? raw(' data-hf-type="date"') : html``}>
      <label class="fd-form-label hf-filter__label" id="${id}--label" for="${id}">${field.label}</label>
      ${control}
    </div>
  `
}

/** FE's "Editing Status" filter for draft roots (shown right after Search): a single-select over
 *  the fixed draft states, mapped to a predicate by `data/filters.js#EDITING_STATUS`. */
function editingStatusField(query, { bundle, t }) {
  const current = query?.['f.EditingStatus'] ?? 'ALL'
  const options = [['ALL', 'All'], ['OWN_DRAFT', 'OwnDraft'], ['UNCHANGED', 'Unchanged']]
  return html`
    <div class="fd-form-item hf-filter">
      <label class="fd-form-label hf-filter__label" for="f-EditingStatus">${t(bundle, 'EditingStatus')}</label>
      <span class="hf-select">
        <select id="f-EditingStatus" name="f.EditingStatus" class="fd-select">
          ${options.map(([value, key]) => html`<option value="${value}" ${value === current ? raw('selected') : html``}>${t(bundle, key)}</option>`)}
        </select>
        <i class="sap-icon--slim-arrow-down" aria-hidden="true"></i>
      </span>
    </div>
  `
}

/** The collapsible List Report header (§3.4): a flex-wrap row of `fd-form-item`s, Search first,
 *  then Editing Status (draft roots), then `SelectionFields` in annotation order, with Go/Adapt
 *  Filters on the right. Submitting the form re-runs the `$table` query and swaps the table body +
 *  count via `<hx-partial>`. */
function filterBar(layout, { basePath, entitySetPath, query, bundle, t, filterOptions = {} }) {
  return html`
    <form id="${ids.lrFilterBar()}" class="hf-filter-bar" data-hf-available="${JSON.stringify((layout.filterBar.available || []).map(f => ({ path: f.path, label: f.label || f.path, type: f.edmType === 'Edm.Date' ? 'date' : undefined })))}"
      hx-get="${basePath}/${entitySetPath}/$table" hx-target="#${ids.lrTableBody()}" hx-swap="innerHTML">
      <div class="fd-form-item hf-filter hf-filter--search">
        <label class="fd-form-label hf-filter__label hf-sr-only" for="lr-search">${t(bundle, 'Search')}</label>
        <div class="hf-input-group">
          <input id="lr-search" name="$search" type="search" class="fd-input" placeholder="${t(bundle, 'Search')}" value="${query?.$search ?? ''}">
          <span class="hf-input-group__addon">
            <button type="submit" class="hf-input-icon" aria-label="${t(bundle, 'Search')}"><i class="sap-icon--search" aria-hidden="true"></i></button>
          </span>
        </div>
      </div>
      ${layout.filterBar.editingStatus ? editingStatusField(query, { bundle, t }) : html``}
      ${layout.filterBar.fields.map(field => filterField(field, query, filterOptions[field.path], { basePath, entitySetPath }))}
      <div class="hf-filter-bar__actions">
        <button type="submit" class="fd-button fd-button--emphasized">${t(bundle, 'Go')}</button>
        <button type="button" class="fd-button fd-button--transparent" data-hf-action="adapt-filters">${t(bundle, 'AdaptFilters')}</button>
      </div>
    </form>
  `
}

module.exports = { filterBar, filterField, isDatePicker }
