const { html, raw } = require('./html')
const ids = require('./ids')
const { evaluate } = require('../annotations/expressions')
const { formField, fieldLabel } = require('./field')
const { rowsHtml, tableHead, columnVisibilityStyle } = require('./table')
const { criticalityClass } = require('../data/format')
const { toast } = require('./toast')

/** Ancestor trail above the title (§3.4: "Title: fd-breadcrumb (sub-OP)"). Like FE, the current
 *  object is not repeated and a top-level Object Page shows no breadcrumb at all. */
function breadcrumbs(trail, basePath) {
  const ancestors = trail.slice(1, -1)
  if (!ancestors.length) return html``
  return html`
    <nav class="fd-breadcrumb hf-breadcrumb" aria-label="breadcrumb">
      <ol class="hf-breadcrumb__list">
        ${ancestors.map(crumb => html`<li class="hf-breadcrumb__item">
              <a class="hf-breadcrumb__link" href="${basePath}${crumb.href}"
                 hx-get="${basePath}${crumb.href}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">${crumb.label}</a>
            </li>`)}
      </ol>
    </nav>`
}

function ratingIndicator(value, max) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100))
  const stars = icon => Array.from({ length: max }, () => html`<i class="sap-icon--${icon}" aria-hidden="true"></i>`)
  return html`<span class="hf-rating" role="img" aria-label="${value} of ${max}"><span class="hf-rating__empty">${stars('unfavorite')}</span><span class="hf-rating__fill" style="width:${pct.toFixed(1)}%">${stars('favorite')}</span></span>`
}

/** `UI.DataPoint` (header facet or section, §3.2): Title + a criticality-colored number/rating. */
function dataPointBlock(label, dp, row, id) {
  const value = evaluate(dp.Value, row)
  const cls = criticalityClass(evaluate(dp.Criticality, row))
  let display
  if (value == null) display = html`–`
  else if (dp.Visualization === 'Rating') display = ratingIndicator(value, Number(dp.TargetValue ?? 5))
  else display = html`<span class="fd-object-number${cls ? ` fd-object-number--${cls}` : ''}">${String(value)}</span>`
  return html`
    <div class="fd-form-item hf-field" id="${id}">
      ${fieldLabel(dp.Title ?? label)}
      <span class="hf-field__value">${display}</span>
    </div>`
}

/** `Communication.Contact` (§3.2 Communication): a small label/value block per contact field
 *  present in the record -- shapes vary (`email`/`tel` are arrays of `{address}`/`{uri}` records). */
function contactBlock(label, contact, row, id) {
  const fn = evaluate(contact.fn, row)
  const email = evaluate(contact.email?.[0]?.address, row)
  const tel = evaluate(contact.tel?.[0]?.uri, row)
  const bday = evaluate(contact.bday, row)
  return html`
    <div class="fd-form-item hf-field" id="${id}">
      ${fieldLabel(label)}
      <span class="hf-field__value">${fn ?? '–'}</span>
      ${email ? html`<a class="fd-link" href="mailto:${email}">${email}</a>` : html``}
      ${tel ? html`<a class="fd-link" href="tel:${tel}">${tel}</a>` : html``}
      ${bday ? html`<span class="hf-field__value">${bday}</span>` : html``}
    </div>`
}

/** FE's ColumnLayout spreads one form container over up to 3 columns, the remainder going to the
 *  last columns (4 fields -> 1 | 1 | 2). */
function formColumns(items, max = 3) {
  const count = Math.min(max, items.length)
  if (!count) return []
  const base = Math.floor(items.length / count)
  const extra = items.length % count
  const cols = []
  let i = 0
  for (let c = 0; c < count; c++) {
    const size = base + (c >= count - extra ? 1 : 0)
    cols.push(items.slice(i, i + size))
    i += size
  }
  return cols
}

function formLayout(blocks) {
  return html`<div class="hf-form">${formColumns(blocks).map(col => html`<div class="hf-form__column">${col}</div>`)}</div>`
}

/** A table-section's child rows (§3.4: "Table subsections reuse `table.js`"). In display mode it has
 *  no selection column (as in FE); in draft mode it adds selection and a "Create" button. */
function tableBlock(facet, ctx) {
  const child = ctx.children?.[facet.id]
  const rows = child?.rows || []
  const entitySetPath = `${ctx.entitySetPath}/${facet.content.nav}`
  const miniLayout = { table: { columns: facet.content.columns } }
  const selectable = !!ctx.isDraft
  return html`
    <div class="hf-table-toolbar hf-table-toolbar--section">
      <h2 class="hf-section__title">${facet.label} (${rows.length})</h2>
      <div class="hf-spacer"></div>
      ${ctx.isDraft ? html`
        <button class="fd-button fd-button--transparent"
          hx-post="${ctx.basePath}/${ctx.entitySetPath}/${facet.content.nav}"
          hx-target="#${ids.opSection(facet.id)}"
          hx-swap="outerHTML">${ctx.t(ctx.bundle, 'Create')}</button>
      ` : html``}
    </div>
    ${columnVisibilityStyle(`#${ids.opSection(facet.id)}`, facet.content.columns, rows, { selectable })}
    <table class="fd-table hf-table" role="table">
      ${tableHead(facet.content.columns, rows, { selectable, sortable: false })}
      <tbody>${rowsHtml(miniLayout, rows, { basePath: ctx.basePath, entitySetPath, keyNames: child?.keyNames || [], bundle: ctx.bundle, t: ctx.t, selectable })}</tbody>
    </table>`
}

/** One facet's content, dispatched by kind (§3.2 Facets row). `identification`/`chart`/`unknown`
 *  content kinds are listed in the term coverage report as partial/ignored and render nothing here. */
function facetContent(facet, row, ctx) {
  const content = facet.content
  if (!content) return html``
  const id = ids.opField(facet.id, 'content')
  switch (content.kind) {
    case 'form':
      return formLayout(content.fields.map(col => formField(col, row, {
        facetId: facet.id, isDraft: ctx.isDraft, basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, valueLists: ctx.valueLists
      })).filter(f => f.value.trim()))
    case 'dataPoint':
      return formLayout([dataPointBlock(facet.label, content.dataPoint, row, id)])
    case 'contact':
      return formLayout([contactBlock(facet.label, content.contact, row, id)])
    case 'address': {
      const address = content.address || {}
      const text = ['street', 'code', 'locality'].map(k => evaluate(address[k], row)).filter(Boolean).join(', ')
      return formLayout([html`<div class="fd-form-item hf-field" id="${id}">${fieldLabel(facet.label)}<span class="hf-field__value">${text || '–'}</span></div>`])
    }
    case 'table':
      return tableBlock(facet, ctx)
    default:
      return html``
  }
}

/** A body section (title + white card) or a header-facet block -- recurses for `CollectionFacet`
 *  nesting (§3.2: "CollectionFacet -> section/subsections"). A table section uses the table's own
 *  "Title (n)" toolbar as its heading, as FE does for single-table sections. */
function facetBlock(facet, row, ctx, { asSection } = {}) {
  if (facet.hidden && evaluate(facet.hidden, row) === true) return html``
  if (facet.kind === 'CollectionFacet') {
    return html`${facet.facets.map(f => facetBlock(f, row, ctx, { asSection }))}`
  }
  const body = facetContent(facet, row, ctx)
  if (!asSection) return html`<div class="hf-header-facet">${body}</div>`
  if (facet.content?.kind === 'table') {
    return html`
      <section id="${ids.opSection(facet.id)}" class="hf-section hf-section--table" aria-label="${facet.label}">${body}</section>`
  }
  return html`
    <section id="${ids.opSection(facet.id)}" class="hf-section">
      <h2 class="hf-section__title">${facet.label}</h2>
      <div class="hf-section__card">${body}</div>
    </section>`
}

/** Text-only anchor bar, hidden entirely when there's only one section
 *  (§3.4: "Anchor bar ... hidden when there is only one section"). */
function anchorBar(sections) {
  if (sections.length < 2) return html``
  return html`
    <nav class="hf-anchor-bar" aria-label="Sections">
      <div class="hf-anchor-bar__tabs" role="tablist">
        ${sections.map((s, i) => html`<a class="hf-anchor-bar__tab${i === 0 ? ' is-selected' : ''}" role="tab" href="#${ids.opSection(s.id)}">${s.label}</a>`)}
      </div>
    </nav>`
}

/** Header action toolbar: in display mode, Edit (-> `$edit`, draft OP) and Delete (-> `DELETE`,
 *  back to List Report); in draft (edit) mode neither applies -- Save/Discard live in the floating
 *  footer instead (§3.4: "floating footer ... Save ... Discard Draft"). Actions are now active buttons
 *  that POST to $action/:name (Phase 5d). */
function headerActions(actions, bundle, t, { basePath, entitySetPath, isDraft } = {}) {
  const opPath = `${basePath}/${entitySetPath}`
  return html`
    <div class="hf-op-title__actions">
      ${actions.map(col => {
        const actionName = col.action?.split('.').pop()
        return html`<button class="fd-button"
          hx-post="${opPath}/$action/${actionName}" hx-target="#app" hx-swap="innerHTML show:window:top">${col.label}</button>`
      })}
      ${isDraft ? html`` : html`
        <button class="fd-button fd-button--emphasized" aria-label="${t(bundle, 'Edit')}"
          hx-post="${opPath}/$edit" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">${t(bundle, 'Edit')}</button>`}
      ${isDraft ? html`` : html`
        <button class="fd-button" aria-label="${t(bundle, 'Delete')}"
          hx-delete="${opPath}" hx-target="#app" hx-push-url="true" hx-confirm="${t(bundle, 'Delete')}?"
          hx-swap="innerHTML show:window:top">${t(bundle, 'Delete')}</button>`}
    </div>`
}

/** Floating footer (§3.4): only present in draft (edit) mode -- "Draft saved" status, Save
 *  (-> `$save`, activates into the active OP), Discard Draft (-> `$discard`, back to either the
 *  active OP or the List Report, decided server-side depending on whether this was a new draft). */
function footerBar(bundle, t, { basePath, entitySetPath, isDraft } = {}) {
  if (!isDraft) return html``
  const opPath = `${basePath}/${entitySetPath}`
  return html`
    <footer class="hf-footer" id="${ids.opFooter()}">
      <div class="hf-spacer"></div>
      <button class="fd-button fd-button--emphasized" hx-post="${opPath}/$save" hx-target="#app" hx-push-url="true"
        hx-swap="innerHTML show:window:top">${t(bundle, 'Save')}</button>
      <button class="fd-button fd-button--transparent" hx-post="${opPath}/$discard" hx-target="#app" hx-push-url="true"
        hx-swap="innerHTML show:window:top">${t(bundle, 'DiscardDraft')}</button>
    </footer>`
}

/** `HeaderInfo.ImageUrl`/`TypeImageUrl`/`Initials` -> FE's rounded-square header avatar. */
function headerAvatar(header, row) {
  const imageUrl = evaluate(header?.imageUrl, row)
  if (imageUrl) return html`<span class="hf-avatar"><img src="${imageUrl}" alt=""></span>`
  const typeImage = evaluate(header?.typeImageUrl, row)
  if (typeof typeImage === 'string' && typeImage.startsWith('sap-icon://')) {
    return html`<span class="hf-avatar"><i class="sap-icon--${typeImage.slice('sap-icon://'.length)}" aria-hidden="true"></i></span>`
  }
  const initials = evaluate(header?.initials, row)
  if (initials) return html`<span class="hf-avatar">${initials}</span>`
  return html``
}

/** Composes the full Object Page (§3.4): breadcrumb, title, header facets, anchor bar, and the
 *  sections themselves (form/dataPoint/contact/address/table content). Draft state (`row.IsActiveEntity
 *  === false`) decides Edit/Delete vs. the floating Save/Discard footer and (via `ctx.isDraft`,
 *  threaded through to `field.js`) whether form fields render as inputs or display text. */
function objectPageFragment(layout, row, ctx) {
  const isDraft = row.IsActiveEntity === false
  const fullCtx = { ...ctx, isDraft }
  const visibleSections = (layout.sections || []).filter(s => !(s.hidden && evaluate(s.hidden, row) === true))
  const title = evaluate(layout.header?.title?.Value, row) ?? layout.header?.typeName ?? ''
  const description = evaluate(layout.header?.description?.Value, row)
  const headerFacets = layout.headerFacets || []
  return html`
    ${ctx.successMessage ? raw(`<hx-partial hx-target="#${ids.toast()}" hx-swap="innerHTML">${toast(ctx.successMessage).value}</hx-partial>`) : html``}
    <div class="hf-page hf-page--op${isDraft ? ' hf-page--edit' : ''}" data-entity-type="${layout.entityType}">
      <header class="hf-page__header hf-op-header" id="${ids.opHeader()}">
        ${breadcrumbs(ctx.trail, ctx.basePath)}
        <div class="hf-op-title">
          ${headerAvatar(layout.header, row)}
          <div class="hf-op-title__text">
            <h1 class="hf-op-title__heading">${title}</h1>
            ${description ? html`<div class="hf-op-title__subtitle">${description}</div>` : html``}
          </div>
          ${isDraft ? html`<span class="hf-op-title__draft" title="${ctx.t(ctx.bundle, 'DraftSaved')}">${ctx.t(ctx.bundle, 'Draft')} <i class="sap-icon--slim-arrow-down" aria-hidden="true"></i></span>` : html``}
          <div class="hf-spacer"></div>
          ${headerActions(layout.headerActions || [], ctx.bundle, ctx.t, { basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, isDraft })}
        </div>
        ${headerFacets.length ? html`<div class="hf-op-header__content">${headerFacets.map(f => facetBlock(f, row, fullCtx, { asSection: false }))}</div>` : html``}
        ${anchorBar(visibleSections)}
      </header>
      <div class="hf-page__content hf-op-content">
        ${visibleSections.map(f => facetBlock(f, row, fullCtx, { asSection: true }))}
      </div>
      ${footerBar(ctx.bundle, ctx.t, { basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, isDraft })}
    </div>`
}

module.exports = { objectPageFragment, breadcrumbs, facetBlock, facetContent, footerBar }
