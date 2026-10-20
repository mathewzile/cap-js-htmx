const { html } = require('./html')
const ids = require('./ids')

/** Render success toast message (auto-dismiss after 3 seconds client-side).
 *  Only one toast is rendered; subsequent calls replace it via htmx. */
function toast(message) {
  if (!message) return html`<div id="${ids.toast()}"></div>`

  return html`
    <div id="${ids.toast()}">
      <div class="fd-message-toast" role="status" aria-live="polite">
        <div class="fd-message-toast__content">
          <span class="fd-message-toast__text">${message}</span>
        </div>
      </div>
    </div>`
}

module.exports = { toast }
