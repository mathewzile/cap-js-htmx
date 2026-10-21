/** Minimal per-type display formatting for table cells / header facet values (§3.4 field renderer
 *  table). Server stays authoritative for validation; these are display-only transforms. */

function formatNumber(value, { scale } = {}) {
  if (value == null) return ''
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return scale != null ? n.toFixed(scale) : String(n)
}

/** Row counts with the locale's grouping separator ("1,005"), like FE's table title and growing trigger. */
function formatCount(value, locale) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  try { return new Intl.NumberFormat(locale || 'en').format(n) } catch { return String(n) }
}

function formatAmount(value, currency) {
  if (value == null) return ''
  const n = Number(value)
  const formatted = Number.isNaN(n) ? String(value) : n.toFixed(2)
  return currency ? `${formatted} ${currency}` : formatted
}

function formatBoolean(value) {
  return value ? 'Yes' : 'No'
}

/** `Criticality` values show up either as the OData enum member name (`"Negative"`, possibly
 *  prefixed `UI.CriticalityType/Negative`) or as the raw integer the enum maps to
 *  (`Negative=1, Critical=2, Positive=3, Neutral=0`), depending on whether the annotation used an
 *  `EnumMember` literal or a `$Path` to a computed integer property (as `stockCriticality` does). */
const CRITICALITY_CLASS = { 0: '', Neutral: '', 1: 'negative', Negative: 'negative', 2: 'critical', Critical: 'critical', 3: 'positive', Positive: 'positive', 5: 'informative', Information: 'informative' }

function criticalityClass(value) {
  if (value == null) return ''
  const key = typeof value === 'string' ? value.split('/').pop() : value
  return CRITICALITY_CLASS[key] ?? ''
}

// the SAP-icons FE V4 (Horizon) puts in front of a criticality-colored ObjectStatus
const CRITICALITY_ICON = { negative: 'error', critical: 'alert', positive: 'sys-enter-2', informative: 'information' }

function criticalityIcon(cls) {
  return CRITICALITY_ICON[cls] ?? ''
}

/** CQL returns a navigation path column (`author.name`) under its flattened alias (`author_name`). */
function columnValue(row, cqlPath) {
  if (row == null || !cqlPath) return undefined
  return row[cqlPath] ?? row[cqlPath.replace(/\./g, '_')]
}

module.exports = { formatCount, formatNumber, formatAmount, formatBoolean, criticalityClass, criticalityIcon, columnValue }
