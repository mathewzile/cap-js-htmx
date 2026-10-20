const { html } = require('./html')
const ids = require('./ids')

/** Render error/warning/info messages as fd-message-strip (single) or fd-message-popover (multiple).
 *  Returns a container that can be targeted by htmx for inline updates. */
function messages(msgs = []) {
  if (!msgs?.length) return html`<div id="${ids.messages()}"></div>`

  const errors = msgs.filter(m => m.severity === 'error')
  const others = msgs.filter(m => m.severity !== 'error')

  if (errors.length === 1 && !others.length) {
    return html`
      <div id="${ids.messages()}">
        <div class="fd-message-strip fd-message-strip--error" role="alert">
          <div class="fd-message-strip__content">
            <div class="fd-message-strip__text">${errors[0].message}</div>
          </div>
          <button class="fd-message-strip__close" aria-label="Close"></button>
        </div>
      </div>`
  }

  if (msgs.length > 1 || errors.length > 1) {
    return html`
      <div id="${ids.messages()}">
        <button class="fd-button fd-button--compact" id="msg-popover-button">
          ${errors.length > 0 ? html`<span class="fd-object-status fd-object-status--negative">${errors.length}</span>` : html``}
          Messages
        </button>
        <div class="fd-popover" id="msg-popover">
          <div class="fd-popover__body">
            ${msgs.map(m => html`
              <div class="fd-message-strip fd-message-strip--${m.severity === 'error' ? 'error' : m.severity === 'warning' ? 'warning' : 'information'}" role="alert">
                <div class="fd-message-strip__content">
                  <div class="fd-message-strip__text">${m.message}</div>
                </div>
              </div>`)}
          </div>
        </div>
      </div>`
  }

  return html`<div id="${ids.messages()}"></div>`
}

module.exports = { messages }
