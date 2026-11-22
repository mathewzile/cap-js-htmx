const { html } = require('./html')

/** The marker of an object somebody else has unsaved changes on (a draft of another user), as Fiori elements shows it: an icon, in the
 *  List Report followed by "Unsaved changes by <name>" (`withText`), in the Object Page header the icon alone. Either opens a popover:
 *  "Unsaved Changes" / "This object has unsaved changes made by <name>." / "Last changed on <date>." (`htmx-fiori.js` toggles it and
 *  keeps the click from opening the table row). `row._lockedBy` is the holder, `row._lockedAt` the time of their last change. */
function lockMarker(row, { bundle, t, locale, withText = false }) {
  const holder = row._lockedBy
  const label = holder ? t(bundle, 'UnsavedChangesBy').replace('{0}', holder) : t(bundle, 'UnsavedChangesByAnotherUser')
  const text = holder ? t(bundle, 'UnsavedChangesText').replace('{0}', holder) : t(bundle, 'UnsavedChangesTextAnotherUser')
  const changed = row._lockedAt ? dateTime(row._lockedAt, locale) : undefined
  return html`<span class="hf-popover hf-draft-lock">
    <button type="button" class="fd-button fd-button--compact fd-button--transparent hf-draft-lock__button" data-hf-popover-toggle aria-haspopup="true" aria-expanded="false" aria-label="${label}" title="${label}"><i class="sap-icon--user-edit" aria-hidden="true"></i>${withText ? html`<span>${label}</span>` : html``}</button>
    <div class="fd-popover__body hf-draft-lock__body">
      <strong>${t(bundle, 'UnsavedChanges')}</strong>
      <p>${text}</p>
      ${changed ? html`<p>${t(bundle, 'LastChangedOn').replace('{0}', changed)}</p>` : html``}
    </div>
  </span>`
}

/** "Oct 27, 2026, 11:06:42 AM": medium date and time in the user's locale (FE formats it the same way). */
function dateTime(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  try { return new Intl.DateTimeFormat(locale || 'en', { dateStyle: 'medium', timeStyle: 'medium' }).format(date) } catch { return date.toISOString() }
}

module.exports = { lockMarker }
