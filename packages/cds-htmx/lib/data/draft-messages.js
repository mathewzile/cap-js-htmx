const cds = require('@sap/cds')
const { collectFormFields } = require('./page')
const { isMandatory } = require('../render/field')

/** Messages about an object being edited (validation, `DraftMessages`), in the shape the page script
 *  (`public/htmx-fiori.js`) keeps and renders: `{ path, text, severity, label }`, where `path` is the
 *  property a field value state belongs to (`title`), or `null` for messages only listed in the
 *  footer's "Message Details" (e.g. about a child row). Same model as FE's message popover. */

const SEVERITY = { 1: 'success', 2: 'info', 3: 'warning', 4: 'error' }

/** `/Books(ID=…,IsActiveEntity=false)/title` or `in/title` -> `title`; anything deeper (`…/chapters(…)/title`) -> null. */
function fieldPathOf(target) {
  if (typeof target !== 'string' || !target) return null
  const segments = target.replace(/^\//, '').split('/')
  if (/^\w+\(.*\)$/.test(segments[0]) || segments[0] === 'in') segments.shift()
  return segments.length === 1 && /^\w+$/.test(segments[0]) ? segments[0] : null
}

/** The `DraftMessages` column of a draft (JSON text or already parsed) -> messages. */
function fromDraftMessages(raw) {
  let list = raw
  if (typeof raw === 'string') { try { list = JSON.parse(raw) } catch { list = [] } }
  return (Array.isArray(list) ? list : []).map(m => ({
    path: fieldPathOf(m.target), text: m.message, severity: SEVERITY[m.numericSeverity] || 'error'
  }))
}

/** A thrown service error (one error, or `details` with their own targets) -> messages. */
/** Errors thrown inside the service carry a message key (`ASSERT_MANDATORY`); the OData error middleware
 *  localizes it on the way out, so in-process it has to be done here (`Provide the missing value.`). */
function textOf(e) {
  if (e.message && e.message !== e.code) return e.message
  return cds.i18n?.messages?.at?.(e.code, cds.context?.locale, e.args) ?? e.code ?? 'Error'
}

function fromError(err) {
  const list = err.details?.length ? err.details : [err]
  return list.map(e => ({ path: fieldPathOf(e.target), text: textOf(e), severity: 'error' }))
}

const labelsOf = layout => {
  const labels = {}
  for (const field of collectFormFields([...(layout.headerFacets || []), ...(layout.sections || [])])) labels[field.path] = field.label
  return labels
}

/** Adds the field label (shown under the message in "Message Details"). */
function labelled(messages, layout) {
  const labels = labelsOf(layout)
  return messages.map(m => ({ ...m, label: m.path ? labels[m.path] ?? m.path : undefined }))
}

/** FE flags a mandatory field the user emptied right away ("Provide the missing value."). */
function missingMandatory(layout, row, paths, text) {
  const fields = collectFormFields([...(layout.headerFacets || []), ...(layout.sections || [])])
  return paths
    .map(path => fields.find(f => f.path === path))
    .filter(field => field && isMandatory(field, row) && isEmpty(row[field.cqlPath]))
    .map(field => ({ path: field.path, text, severity: 'error' }))
}

const isEmpty = value => value == null || (typeof value === 'string' && value.trim() === '')

/** `HX-Trigger` value that makes the page script update its message list: `set` messages are added
 *  (replacing those of the same path), `clear` paths removed, `reset` replaces everything. Header values
 *  are Latin-1, so non-ASCII is escaped. */
function triggerHeader({ set = [], clear = [], reset = false }) {
  return JSON.stringify({ 'hf:messages': { set, clear, reset } }).replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

module.exports = { fieldPathOf, fromDraftMessages, fromError, labelled, missingMandatory, triggerHeader, isEmpty }
