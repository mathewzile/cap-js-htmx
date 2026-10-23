const { html, raw, escape, partial } = require('./html')

/** Flexible Column Layout (`sap.f.FlexibleColumnLayout`, the container FE uses when an app's manifest asks for it).
 *  Column 0 is the List Report, column 1 its Object Page, column 2 a sub-object page (deeper pages replace it).
 *
 *  A page that opens in a column answers with `<hx-partial>`s that swap its own column and trim the ones to the right
 *  (htmx skips the main swap of a response that has nothing but partials, so `#app` and the columns to the left stay
 *  as they are). A page that is loaded on its own (reload, deep link, no layout on screen yet) answers with the whole
 *  layout: its column plus placeholders that load the columns to the left (`X-Hf-Fcl: keep` = "do not trim, do not
 *  touch the title"). `#fcl-marker` tells the page script which layout the column asks for (`htmx-fiori.js`). */

const COLUMNS = 3

const layoutFor = (column, layouts) => column === 0 ? 'OneColumn' : column === 1 ? layouts.two : layouts.three

const colId = column => `fcl-col-${column}`

/** The separator on the left edge of a column (not the first): drag it to resize, the arrow gives the column beside it more room
 *  (`htmx-fiori.js` wires both; the arrow only shows in the layouts that have a counterpart). */
const separator = column => column < 1 ? html`` : html`<div class="hf-fcl__sep" data-hf-sep role="separator" aria-orientation="vertical" tabindex="0">
  <button type="button" class="hf-fcl__arrow" data-hf-fcl-arrow tabindex="-1" hidden><i class="sap-icon--slim-arrow-right" aria-hidden="true"></i></button>
  <span class="hf-fcl__grip" aria-hidden="true"><i class="sap-icon--vertical-grip"></i></span></div>`

/** A column is a box of the layout's height; the page scrolls in its `hf-fcl__scroll` inside it (like FE: every column has its own
 *  vertical scrollbar), while the separator stays on the box. */
const columnElement = (column, inner, url) => html`<section id="${colId(column)}" class="hf-fcl__col" data-hf-col="${column}"${url ? html` data-hf-url="${url}"` : html``}>${separator(column)}<div class="hf-fcl__scroll">${inner}</div></section>`

const emptyColumn = column => html`<section id="${colId(column)}" class="hf-fcl__col" data-hf-col="${column}" hidden></section>`

/** A column to the left of the page that was loaded: fetched by the browser as soon as the layout is in. */
const lazyColumn = (column, url) => html`<section id="${colId(column)}" class="hf-fcl__col" data-hf-col="${column}"
  hx-get="${url}" hx-trigger="load" hx-swap="none" hx-push-url="false" hx-target="#app" hx-headers='{"X-Hf-Fcl":"keep"}'></section>`

const markerElement = (column, layouts) => html`<span id="fcl-marker" hidden data-hf-col="${column}" data-hf-layout="${layoutFor(column, layouts)}"></span>`

/** The whole layout, with `inner` in `column` and placeholders (`urls[n]`) in the columns before it. */
function structure(column, inner, { layouts, urls, url }) {
  const columns = Array.from({ length: COLUMNS }, (_, n) => n < column ? lazyColumn(n, urls[n]) : n === column ? columnElement(n, inner, url) : emptyColumn(n))
  return html`<div id="fcl" class="hf-fcl" data-hf-layout="${layoutFor(column, layouts)}" data-hf-deepest="${column}">${columns}${markerElement(column, layouts)}</div>`
}

/** The columns to the right of `column` are emptied and the marker follows the column. */
function trim(column, layouts) {
  const empty = Array.from({ length: COLUMNS - column - 1 }, (_, i) => partial(`#${colId(column + 1 + i)}`, 'outerHTML', emptyColumn(column + 1 + i).value))
  return [...empty, partial('#fcl-marker', 'outerHTML', markerElement(column, layouts).value)].join('\n')
}

/** Swaps `column` in place. `keep`: a column that is only being filled in (placeholder), nothing else changes. `keepDeeper`: the
 *  columns to its right stay (Edit, Save and Discard of the first page: the page of the third column follows to its draft or active
 *  version, see `htmx-fiori.js`). `url` is the page's own URL, which that follow-up needs. */
function columnPartials(column, inner, { layouts, keep, keepDeeper, url }) {
  const own = partial(`#${colId(column)}`, 'outerHTML', columnElement(column, inner, url).value)
  return keep || keepDeeper ? own : `${own}\n${trim(column, layouts)}`
}

/** Splits the `<hx-partial>`s (toast, messages) off a page body: they have to sit beside the column partial, a partial
 *  inside a partial is never processed. */
function hoistPartials(body) {
  const found = []
  const rest = String(body).replace(/<hx-partial\b[\s\S]*?<\/hx-partial>/g, m => { found.push(m); return '' })
  return { partials: found.join('\n'), body: raw(rest) }
}

/** The buttons of a column header: full screen / exit full screen and close (not for the first column). */
/** `editing`: the page is being edited, so Close asks first (the draft or the changes stay, they are not saved). */
function columnButtons(column, { t, bundle, closeHref, editing }) {
  if (column < 1) return html``
  return html`
    <div class="hf-fcl__buttons">
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-fcl-fullscreen aria-pressed="false"
        aria-label="${t(bundle, 'EnterFullScreen')}" title="${t(bundle, 'EnterFullScreen')}"
        data-hf-enter="${t(bundle, 'EnterFullScreen')}" data-hf-exit="${t(bundle, 'ExitFullScreen')}"><i class="sap-icon--full-screen" aria-hidden="true"></i></button>
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" aria-label="${t(bundle, 'CloseColumn')}" title="${t(bundle, 'CloseColumn')}"
        hx-get="${closeHref}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML" hx-headers='{"X-Hf-Fcl":"shown"}'${editing ? raw(` hx-confirm="${escape(t(bundle, 'ConfirmCloseColumn'))}" data-hf-confirm-title="${escape(t(bundle, 'CloseColumn'))}" data-hf-confirm-ok="${escape(t(bundle, 'CloseColumn'))}" data-hf-confirm-cancel="${escape(t(bundle, 'Cancel'))}"`) : ''}><i class="sap-icon--decline" aria-hidden="true"></i></button>
    </div>`
}

module.exports = { COLUMNS, layoutFor, structure, columnPartials, trim, hoistPartials, columnButtons, markerElement }
