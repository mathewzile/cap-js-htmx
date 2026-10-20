const { html } = require('./html')

/** Dev-only "SSE playground" (`GET <service>/$playground`): everything needed to watch side effects and
 *  server-pushed events work without wiring a test client by hand.
 *   - which browser pages are connected right now and what each is looking at
 *   - a live log of the raw SSE messages (the page connects as its own client)
 *   - links to open objects in other tabs, and the service's unbound actions as forms, so an event
 *     fired here shows up in the other tabs. */

function clientsTable(clients, { t }) {
  if (!clients.length) return html`<p class="hf-playground__empty">${t('No pages connected yet.')}</p>`
  return html`
    <table class="fd-table hf-table" role="table">
      <thead><tr class="fd-table__row"><th class="fd-table__cell">Client</th><th class="fd-table__cell">User</th><th class="fd-table__cell">App</th><th class="fd-table__cell">Showing</th></tr></thead>
      <tbody>${clients.map(c => html`
        <tr class="fd-table__row">
          <td class="fd-table__cell"><code>${c.id}</code></td>
          <td class="fd-table__cell">${c.user}</td>
          <td class="fd-table__cell">${c.app ?? '–'}</td>
          <td class="fd-table__cell">${c.view}</td>
        </tr>`)}
      </tbody>
    </table>`
}

function actionForm(action, { basePath }) {
  return html`
    <form class="hf-playground__action" hx-post="${basePath}/$playground/action/${action.name}" hx-target="next .hf-playground__result" hx-swap="innerHTML" hx-push-url="false">
      <strong>${action.name}</strong>
      ${action.params.map(p => html`
        <label class="fd-form-label">${p.name}
          <input class="fd-input" name="${p.name}" placeholder="${p.type}" ${p.example ? html`value="${p.example}"` : html``}>
        </label>`)}
      <button class="fd-button fd-button--emphasized" type="submit">Run</button>
    </form>
    <pre class="hf-playground__result"></pre>`
}

function playground({ basePath, service, links, actions, clients, watchSet, t }) {
  return html`
    <div class="hf-page hf-playground">
      <header class="hf-page__header"><h1 class="hf-op-title__heading">SSE playground — ${service}</h1></header>
      <div class="hf-page__content">
        <section class="hf-section">
          <h2 class="hf-section__title">How to try it</h2>
          <div class="hf-section__card">
            <ol>
              <li>Open an object from <em>Open in a new tab</em> below (it connects its own SSE channel).</li>
              <li>In that tab press <strong>Edit</strong> and change <em>Stock</em>: the Status field updates without a reload (a field-change side effect).</li>
              <li>Open the same book in a second tab <em>without</em> editing, then run <code>simulateDelivery</code> here: the second tab updates live (a <code>SourceEvents</code> side effect), and so does an open List Report row.</li>
            </ol>
          </div>
        </section>
        <section class="hf-section">
          <h2 class="hf-section__title">Connected pages</h2>
          <div class="hf-section__card" id="playground-clients" hx-get="${basePath}/$playground/clients" hx-trigger="every 2s" hx-swap="innerHTML" hx-push-url="false">${clientsTable(clients, { t })}</div>
        </section>
        <section class="hf-section">
          <h2 class="hf-section__title">Open in a new tab</h2>
          <div class="hf-section__card"><ul>${links.map(l => html`<li><a class="fd-link" href="${l.href}" target="_blank" rel="noopener">${l.label}</a></li>`)}</ul></div>
        </section>
        <section class="hf-section">
          <h2 class="hf-section__title">Fire an action</h2>
          <div class="hf-section__card">${actions.length ? actions.map(a => actionForm(a, { basePath })) : html`<p>This service has no unbound actions.</p>`}</div>
        </section>
        <section class="hf-section">
          <h2 class="hf-section__title">Live SSE log <small>(this page's own channel; it shows the ${watchSet ?? ''} List Report, so row pushes arrive here too)</small></h2>
          <div class="hf-section__card"><pre id="playground-log" class="hf-playground__log" data-events="${basePath}/$events" data-watch="${watchSet ?? ''}" data-watch-url="${basePath}/$playground/watch"></pre></div>
        </section>
      </div>
    </div>
    <script src="/htmx/-/public/htmx-playground.js" defer></script>`
}

module.exports = { playground, clientsTable }
