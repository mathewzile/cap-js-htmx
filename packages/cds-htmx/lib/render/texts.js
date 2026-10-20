const i18n = require('../i18n')

/** The texts the page scripts show in dialogs they build themselves (view settings, adapt filters, variants,
 *  CSV export names). Sent once with the full page as JSON (`#hf-texts`) in the locale of the request. */
const KEYS = [
  'ViewSettings', 'Columns', 'Sort', 'SortBy', 'Ascending', 'Descending', 'AdaptFilters', 'FilterValuesAndVisibility', 'Reset', 'OK',
  'Cancel', 'Go', 'Search', 'ExportCsv', 'Standard', 'SaveAs', 'VariantName', 'NoSort', 'Show', 'Settings', 'Delete', 'Items', 'HideUnselected',
  'DefineConditions', 'EqualTo', 'NotEqualTo', 'Contains', 'StartsWith', 'EndsWith', 'AddCondition', 'Value', 'NoConditions', 'Conditions'
]

function textsFor(bundle) {
  return Object.fromEntries(KEYS.map(key => [key, i18n.t(bundle, key)]))
}

/** JSON safe inside a `<script>`: `</script>` and `<!--` can't appear. */
const asScriptJson = value => JSON.stringify(value).replace(/</g, '\u003c')

module.exports = { textsFor, asScriptJson }
