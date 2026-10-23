const { html, raw } = require('./html')
const ids = require('./ids')
const { evaluate, paths: pathsOf } = require('../annotations/expressions')
const { formField, fieldLabel } = require('./field')
const { rowsHtml, tableHead, columnVisibilityStyle, rowHref, treeAttributes, sectionGrowing } = require('./table')
const { formatCount } = require('../data/format')
const { criticalityClass } = require('../data/format')
const { toast } = require('./toast')
const { canEdit, canDelete } = require('../model/edit-capabilities')
const fclRender = require('./fcl')

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

/** FE's RatingIndicator rounds to half stars (4.7 shows 4.5). A star glyph fills 1.375 of its 1.6875rem slot
 *  (the rest is margin), so a half star clips at half of the glyph, not half of the slot. */
const STAR_GLYPH_SHARE = 1.375 / 1.6875

function ratingIndicator(value, max) {
  const rounded = Math.max(0, Math.min(max, Math.round(Number(value) * 2) / 2))
  const whole = Math.floor(rounded)
  const pct = ((whole + (rounded - whole) * STAR_GLYPH_SHARE) / max) * 100
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

/** `groupId`: the facet (UI.FieldGroup) the fields belong to; side effects of a change in it wait until the group is left. */
function formLayout(blocks, groupId) {
  return html`<div class="hf-form"${groupId ? html` data-hf-fieldgroup="${groupId}"` : html``}>${formColumns(blocks).map(col => html`<div class="hf-form__column">${col}</div>`)}</div>`
}

/** A table-section's child rows (§3.4: "Table subsections reuse `table.js`"). In display mode it has
 *  no selection column (as in FE); in draft mode it adds selection and a "Create" button. */
/** What a table section of a page being edited offers: inputs in its cells (the target is updatable), a selection column and Delete
 *  (deletable), Create and paste (a composition, which is where rows are made, and insertable). A read-only target (`@readonly`) or a
 *  restricted navigation is shown as it is in display mode, its rows still open their page. */
function sectionMode(facet, ctx) {
  const caps = facet.content.capabilities || {}
  const draft = !!ctx.isDraft
  return {
    draft,
    editing: draft && caps.updatable !== false,
    selectable: draft && caps.deletable !== false,
    creatable: draft && !!facet.content.composition && caps.insertable !== false
  }
}

function tableBlock(facet, ctx) {
  const child = ctx.children?.[facet.id]
  const rows = child?.rows || []
  const nav = facet.content.nav
  const entitySetPath = `${ctx.entitySetPath}/${nav}`
  const sectionId = ids.opSection(facet.id)
  const mode = sectionMode(facet, ctx)
  const { editing, selectable } = mode
  // A tree table (display mode): its rows and the children of an expanded node are the hierarchy entity's own set
  const tree = !mode.draft && child?.tree
  const miniLayout = { navigable: facet.content.navigable, table: { columns: facet.content.columns, hierarchy: tree ? facet.content.hierarchy : undefined } }
  const rowSetPath = tree ? tree.set : entitySetPath
  const keyNames = child?.keyNames || []
  const bundle = ctx.bundle
  const t = key => ctx.t(bundle, key)
  // A table that pages (everything but a tree and the rows of a non-draft object being edited): the section's own `$table` serves
  // the next pages, a search and a sort, like the List Report's
  const paged = child?.count != null
  const tableUrl = `${ctx.basePath}/${entitySetPath}/$table`
  // While the draft is edited the rows are inputs; a change is PATCHed to the child's own draft
  const edit = editing ? { nav, rowPath: row => rowHref(ctx.basePath, entitySetPath, keyNames, row) } : undefined
  return html`
    <div class="hf-table-toolbar hf-table-toolbar--section">
      <h2 class="hf-section__title">${facet.label}${tree ? html`` : html`<span id="${sectionId}-count"> (${paged ? formatCount(child.count, ctx.locale) : rows.length})</span>`}</h2>
      <div class="hf-spacer"></div>
      <div class="hf-input-group hf-section-search">
        <input type="search" class="fd-input" data-hf-table-search placeholder="${t('Search')}" aria-label="${t('Search')}">
        <span class="hf-input-group__addon"><span class="hf-input-icon"><i class="sap-icon--search" aria-hidden="true"></i></span></span>
      </div>
      ${mode.draft ? html`
        ${mode.creatable ? html`<button class="fd-button fd-button--transparent" hx-post="${ctx.basePath}/${ctx.entitySetPath}/${nav}"
          hx-target="#app" hx-push-url="false" hx-swap="innerHTML show:window:top">${t('Create')}</button>` : html``}
        ${selectable ? html`<button class="fd-button fd-button--transparent" disabled data-hf-needs-selection="#${sectionId}" aria-label="${t('Delete')}"
          hx-post="${ctx.basePath}/${entitySetPath}/$delete" hx-include="#${sectionId}" hx-target="#app" hx-push-url="false" hx-swap="innerHTML show:window:top"
          hx-confirm="${t('ConfirmDeleteSelected')}" data-hf-confirm-count="#${sectionId} tbody .hf-checkbox:checked"
          data-hf-confirm-title="${t('Delete')}" data-hf-confirm-ok="${t('Delete')}" data-hf-confirm-cancel="${t('Cancel')}" data-hf-confirm-critical>${t('Delete')}</button>` : html``}` : html``}
      <span class="hf-toolbar-separator"></span>
      ${editing && mode.creatable ? html`<button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-action="paste" data-hf-paste-url="${ctx.basePath}/${entitySetPath}/$paste" aria-label="${t('Paste')}" title="${t('Paste')}"><i class="sap-icon--paste" aria-hidden="true"></i></button>` : html``}
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-action="${paged ? 'export-section' : 'export-dom'}" data-hf-export="${tableUrl.replace(/\$table$/, '$export')}" data-hf-filename="${facet.label}" aria-label="${t('ExportCsv')}" title="${t('ExportCsv')}"><i class="sap-icon--excel-attachment" aria-hidden="true"></i></button>
      <button type="button" class="fd-button fd-button--transparent hf-icon-button" data-hf-action="settings" aria-label="${t('ViewSettings')}" title="${t('ViewSettings')}"><i class="sap-icon--action-settings" aria-hidden="true"></i></button>
    </div>
    ${columnVisibilityStyle(`#${sectionId}`, facet.content.columns, rows, { selectable })}
    <table class="fd-table hf-table" role="${tree ? 'treegrid' : 'table'}"${treeAttributes(miniLayout, ctx.basePath, rowSetPath)}${paged ? html` data-hf-table-url="${tableUrl}"` : html``}>
      ${tableHead(facet.content.columns, rows, { selectable, sortable: false, editing, sortKeys: paged })}
      <tbody id="${sectionId}-body">${rowsHtml(miniLayout, rows, { basePath: ctx.basePath, entitySetPath: rowSetPath, keyNames, bundle, t: ctx.t, selectable, edit })}</tbody>
    </table>
    ${paged ? sectionGrowing(sectionId, tableUrl, { skip: rows.length, hasMore: child.hasMore, count: child.count, bundle, t: ctx.t, locale: ctx.locale }) : html``}`
}

/** The single label/value block of a dataPoint / contact / address facet. Its `id` is what the
 *  side-effects engine targets when one of the facet's source properties changes. */
function valueBlock(facet, row, id) {
  const content = facet.content
  if (content.kind === 'dataPoint') return dataPointBlock(facet.label, content.dataPoint, row, id)
  if (content.kind === 'contact') return contactBlock(facet.label, content.contact, row, id)
  const address = content.address || {}
  const text = ['street', 'code', 'locality'].map(k => evaluate(address[k], row)).filter(Boolean).join(', ')
  return html`<div class="fd-form-item hf-field" id="${id}">${fieldLabel(facet.label)}<span class="hf-field__value">${text || '–'}</span></div>`
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
        facetId: facet.id, isDraft: ctx.isDraft, editMode: ctx.editMode, basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, valueLists: ctx.valueLists
      })).filter(f => f.value.trim()), facet.id)
    case 'dataPoint':
    case 'contact':
    case 'address':
      return formLayout([valueBlock(facet, row, id)])
    case 'table':
      return tableBlock(facet, ctx)
    default:
      return html``
  }
}

/** A body section (title + white card) or a header-facet block -- recurses for `CollectionFacet`
 *  nesting (§3.2: "CollectionFacet -> section/subsections"). A table section uses the table's own
 *  "Title (n)" toolbar as its heading, as FE does for single-table sections. */
function facetBlock(facet, row, ctx, { asSection, hidden = false } = {}) {
  hidden = hidden || (facet.hidden && evaluate(facet.hidden, row) === true)
  if (facet.kind === 'CollectionFacet') {
    return html`${facet.facets.map(f => facetBlock(f, row, ctx, { asSection, hidden }))}`
  }
  // A hidden facet leaves an empty placeholder with its id, so a later edit that makes it visible has
  // something to swap the real content into
  if (hidden) return html`<div id="${asSection ? ids.opSection(facet.id) : ids.opHeaderFacet(facet.id)}" hidden></div>`
  const body = facetContent(facet, row, ctx)
  if (!asSection) return html`<div class="hf-header-facet" id="${ids.opHeaderFacet(facet.id)}">${body}</div>`
  if (facet.content?.kind === 'table') {
    return html`
      <section id="${ids.opSection(facet.id)}" class="hf-section hf-section--table" aria-label="${facet.label}" data-hf-view="section:${facet.content.targetEntityType}:${facet.id}">${body}</section>`
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
  if (sections.length < 2) return html`<div id="${ids.opAnchor()}"></div>`
  return html`
    <nav id="${ids.opAnchor()}" class="hf-anchor-bar" aria-label="Sections">
      <div class="hf-anchor-bar__tabs" role="tablist">
        ${sections.map((s, i) => html`<a class="hf-anchor-bar__tab${i === 0 ? ' is-selected' : ''}" role="tab" href="#${ids.opSection(s.id)}">${s.label}</a>`)}
      </div>
    </nav>`
}

/** Header action toolbar: in display mode, Edit (-> `$edit`, draft OP) and Delete (-> `DELETE`,
 *  back to List Report); in draft (edit) mode neither applies -- Save/Discard live in the floating
 *  footer instead (§3.4: "floating footer ... Save ... Discard Draft"). Actions are now active buttons
 *  that POST to $action/:name (Phase 5d). */
function headerActions(actions, bundle, t, { basePath, entitySetPath, editMode, canEdit, canDelete, draftExists, isDraftRoot } = {}) {
  const opPath = `${basePath}/${entitySetPath}`
  const display = !editMode
  return html`
    <div class="hf-op-title__actions">
      ${actions.map(col => {
        const actionName = col.action?.split('.').pop()
        return html`<button class="fd-button"
          hx-post="${opPath}/$action/${actionName}" hx-target="#app" hx-swap="innerHTML show:window:top">${col.label}</button>`
      })}
      ${display && canEdit && !draftExists ? html`
        <button class="fd-button fd-button--emphasized" aria-label="${t(bundle, 'Edit')}"
          hx-post="${opPath}/$edit" hx-target="#app" hx-push-url="false" hx-swap="innerHTML show:window:top">${t(bundle, 'Edit')}</button>` : html``}
      ${display && canDelete ? html`
        <button class="fd-button" aria-label="${t(bundle, 'Delete')}" ${draftExists ? raw('disabled') : html``}
          hx-delete="${opPath}" hx-target="#app" hx-push-url="false" hx-swap="innerHTML show:window:top"
          ${confirmAttrs(t(bundle, 'ConfirmDeleteObject'), { bundle, t, title: 'Delete', ok: 'Delete', critical: true })}>${t(bundle, 'Delete')}</button>` : html``}
    </div>`
}

/** `hx-confirm` plus the data attributes `htmx-fiori.js` turns into a UI dialog (never `window.confirm`). */
function confirmAttrs(text, { bundle, t, title, ok, critical }) {
  return html`hx-confirm="${text}" data-hf-confirm-title="${t(bundle, title)}" data-hf-confirm-ok="${t(bundle, ok)}" data-hf-confirm-cancel="${t(bundle, 'Cancel')}"${critical ? raw(' data-hf-confirm-critical') : html``}`
}

/** Floating footer (§3.4), present in every edit mode:
 *   - `draft`: Save (activates the draft) and Discard Draft (asks first, like FE's popover)
 *   - `direct`: non-draft entity being edited in place: Save PATCHes the active entity, Cancel drops the changes
 *   - `create`: non-draft entity, new object: Create POSTs the form, Cancel goes back to the List Report
 *  `direct`/`create` send the page's own inputs (`hx-include`), `draft` already PATCHed them one by one. */
function footerBar(bundle, t, { basePath, entitySetPath, editMode, node } = {}) {
  if (!editMode) return html``
  const opPath = `${basePath}/${entitySetPath}`
  // A child row of a draft has no Save of its own: its changes are part of the root's draft, Apply goes back to it
  if (node) {
    const parent = `${basePath}/${entitySetPath.replace(/\/[^/]+$/, '')}`
    return html`
      <footer class="hf-footer" id="${ids.opFooter()}">
        <div id="${ids.opMessages()}" class="hf-footer__messages"></div>
        <div class="hf-spacer"></div>
        <span id="${ids.opDraftStatus()}" class="hf-draft-status" aria-live="polite" data-saving="${t(bundle, 'Saving')}"></span>
        <button class="fd-button fd-button--emphasized" hx-get="${parent}" hx-target="#app" hx-push-url="true" hx-swap="innerHTML show:window:top">${t(bundle, 'Apply')}</button>
      </footer>`
  }
  const discard = html`<button class="fd-button fd-button--transparent" hx-post="${opPath}/$discard" hx-target="#app" hx-push-url="false"
    hx-swap="innerHTML show:window:top" ${confirmAttrs(t(bundle, 'ConfirmDiscardDraft'), { bundle, t, title: 'DiscardDraft', ok: 'DiscardDraft' })}>${t(bundle, 'DiscardDraft')}</button>`
  return html`
    <footer class="hf-footer" id="${ids.opFooter()}">
      <div id="${ids.opMessages()}" class="hf-footer__messages"></div>
      <div class="hf-spacer"></div>
      <span id="${ids.opDraftStatus()}" class="hf-draft-status" aria-live="polite" data-saving="${t(bundle, 'Saving')}"></span>
      <button class="fd-button fd-button--emphasized" hx-post="${opPath}/$save" hx-target="#app" hx-push-url="false"
        hx-swap="innerHTML show:window:top">${t(bundle, 'Save')}</button>
      ${discard}
    </footer>`
}

/** Active entity path <-> draft path of the same object (`IsActiveEntity=true|false`). */
const switchedPath = (path, active) => path.replace(/IsActiveEntity=(true|false)/g, `IsActiveEntity=${active}`)

/** FE's draft marker beside the title (design check against the FE reference app):
 *   - editing a draft that has a saved version: "Draft" with a popover to switch to the Saved Version
 *   - viewing the saved version while a draft exists: "Saved Version" with a popover to switch to the Draft
 *   - a brand-new draft (nothing to switch to) is a plain "Draft" label */
function draftIndicator(row, { basePath, entitySetPath, bundle, t, editMode }) {
  const onDraft = editMode === 'draft'
  const switchable = onDraft ? row.HasActiveEntity === true : row.HasDraftEntity === true
  if (!onDraft && !switchable) return html``
  const label = t(bundle, onDraft ? 'Draft' : 'SavedVersion')
  if (!switchable) return html`<span class="hf-op-title__draft" title="${t(bundle, 'DraftSaved')}"><span class="fd-button fd-button--compact fd-button--transparent hf-draft-label">${label}</span></span>`
  const item = (text, current, path) => html`<li>
    <button type="button" class="hf-popover__item"${current ? raw(' aria-current="true"') : html``}${current ? html`` : html` hx-get="${basePath}/${path}" hx-target="#app" hx-replace-url="true" hx-swap="innerHTML show:window:top"`}>${text}</button></li>`
  return html`
    <div class="hf-popover hf-op-title__draft">
      <button type="button" class="fd-button fd-button--compact fd-button--transparent hf-draft-label" data-hf-popover-toggle aria-haspopup="true" aria-expanded="false">${label} <i class="sap-icon--slim-arrow-down" aria-hidden="true"></i></button>
      <div class="fd-popover__body"><ul class="hf-popover__list">
        ${item(t(bundle, 'Draft'), onDraft, switchedPath(entitySetPath, false))}
        ${item(t(bundle, 'SavedVersion'), !onDraft, switchedPath(entitySetPath, true))}
      </ul></div>
    </div>`
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

/** The title, or FE's "Unnamed Object" while it is empty (e.g. the user cleared it in a draft). */
function titleOf(layout, row, ctx) {
  const value = evaluate(layout.header?.title?.Value, row)
  if (value == null || String(value).trim() === '') {
    if (row.HasActiveEntity === false) return ctx.t(ctx.bundle, 'NewObject').replace('{0}', layout.header?.typeName ?? '') // a draft that was never saved
    return layout.header?.title?.Value ? ctx.t(ctx.bundle, 'UnnamedObject') : layout.header?.typeName ?? ''
  }
  return value
}

/** Heading + subtitle (`HeaderInfo.Title`/`Description`); own id so a side effect can refresh just the title. */
function titleText(title, description) {
  return html`<div id="${ids.opTitle()}" class="hf-op-title__text">
            <h1 class="hf-op-title__heading">${title}</h1>
            ${description ? html`<div class="hf-op-title__subtitle">${description}</div>` : html``}
          </div>`
}

/** Composes the full Object Page (§3.4): breadcrumb, title, header facets, anchor bar, and the
 *  sections themselves (form/dataPoint/contact/address/table content). Draft state (`row.IsActiveEntity
 *  === false`) decides Edit/Delete vs. the floating Save/Discard footer and (via `ctx.isDraft`,
 *  threaded through to `field.js`) whether form fields render as inputs or display text. */
function objectPageFragment(layout, row, ctx) {
  // A page reached through a navigation of another object page (an Award, a Book of an Author) has no Delete of its own, as in FE:
  // rows are deleted from the table of the page before it
  const subPage = ctx.trail?.length > 2
  const editMode = editModeOf(ctx, row)
  const isDraft = editMode === 'draft'
  const fullCtx = { ...ctx, isDraft, editMode }
  const visibleSections = (layout.sections || []).filter(s => !(s.hidden && evaluate(s.hidden, row) === true))
  const title = editMode === 'create'
    ? ctx.t(ctx.bundle, 'NewObject').replace('{0}', layout.header?.typeName ?? '')
    : titleOf(layout, row, ctx)
  const description = evaluate(layout.header?.description?.Value, row)
  const headerFacets = layout.headerFacets || []
  return html`
    ${ctx.successMessage ? raw(`<hx-partial hx-target="#${ids.toast()}" hx-swap="outerHTML">${toast(ctx.successMessage).value}</hx-partial>`) : html``}
    <div id="${ids.opPage()}" class="hf-page hf-page--op${editMode ? ' hf-page--edit' : ''}" data-entity-type="${layout.entityType}"${ctx.messages?.length ? html` data-hf-messages="${JSON.stringify(ctx.messages)}"` : html``}>
      <header class="hf-page__header hf-op-header" id="${ids.opHeader()}">
        ${ctx.fcl ? html`` : breadcrumbs(ctx.trail, ctx.basePath)}
        <div class="hf-op-title">
          ${headerAvatar(layout.header, row)}
          ${titleText(title, description)}
          ${layout.edit?.mode === 'node' ? html`` : draftIndicator(row, { basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, bundle: ctx.bundle, t: ctx.t, editMode })}
          <div class="hf-spacer"></div>
          ${headerActions(layout.headerActions || [], ctx.bundle, ctx.t, {
            basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, editMode,
            canEdit: !layout.edit || canEdit(layout.edit, row), canDelete: (!layout.edit || canDelete(layout.edit, row)) && !subPage,
            draftExists: row.HasDraftEntity === true, isDraftRoot: layout.edit?.mode === 'draft'
          })}
          ${ctx.fcl ? fclRender.columnButtons(ctx.fcl.column, { t: ctx.t, bundle: ctx.bundle, closeHref: ctx.fcl.closeHref, editing: !!editMode }) : html``}
        </div>
        ${headerFacets.length ? html`<div class="hf-op-header__content">${headerFacets.map(f => facetBlock(f, row, fullCtx, { asSection: false }))}</div>` : html``}
        ${anchorBar(visibleSections)}
      </header>
      <div class="hf-page__content hf-op-content">
        ${(layout.sections || []).map(f => facetBlock(f, row, fullCtx, { asSection: true }))}
      </div>
      ${footerBar(ctx.bundle, ctx.t, { basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, editMode, node: layout.edit?.mode === 'node' })}
    </div>`
}

/** Edit mode of a page: passed in by the route (`direct`/`create` for non-draft entities) or implied
 *  by a draft row (`IsActiveEntity === false`). `undefined` = display mode. */
function editModeOf(ctx, row) {
  return ctx.editMode ?? (row.IsActiveEntity === false ? 'draft' : undefined)
}

/** Visits every leaf (non-`CollectionFacet`) facet of the header and body, in render order. */
function eachLeaf(facets, fn) {
  for (const facet of facets || []) {
    if (facet.kind === 'CollectionFacet') eachLeaf(facet.facets, fn)
    else fn(facet)
  }
}

/** The DOM updates a `Common.SideEffects` target list asks for (§4.2.1): one `{target, html, swap}`
 *  per rendered occurrence of a target property (a form field, a dataPoint/contact/address block, the
 *  title), one per targeted table section, or the whole page for the `''`/`'*'` wildcard. The engine
 *  wraps each as an `<hx-partial>`. `properties` hold OData paths, `entities` navigation names. */
function sideEffectParts(layout, row, ctx, { properties = [], entities = [], all = false, exclude = [] } = {}) {
  const editMode = editModeOf(ctx, row)
  const isDraft = editMode === 'draft'
  const fullCtx = { ...ctx, isDraft, editMode }
  if (all) return [{ target: '#' + ids.opPage(), html: objectPageFragment(layout, row, ctx), swap: 'outerMorph' }]

  const props = new Set(properties)
  const parts = []
  const header = layout.header || {}
  if ([header.title, header.description].some(expr => pathsOf(expr).some(p => props.has(p)))) {
    const title = titleOf(layout, row, ctx)
    parts.push({ target: '#' + ids.opTitle(), html: titleText(title, evaluate(header.description?.Value, row)), swap: 'outerMorph' })
  }
  eachLeaf([...(layout.headerFacets || []), ...(layout.sections || [])], facet => {
    if (facet.hidden && evaluate(facet.hidden, row) === true) return
    const content = facet.content
    if (!content) return
    if (content.kind === 'form') {
      for (const col of content.fields) {
        const field = col.field
        if (!field || !(props.has(field.path) || pathsOf(col).some(p => props.has(p)))) continue
        parts.push({
          target: '#' + ids.opField(facet.id, field.path), swap: 'outerMorph',
          html: formField(col, row, { facetId: facet.id, isDraft, editMode, basePath: ctx.basePath, entitySetPath: ctx.entitySetPath, valueLists: ctx.valueLists })
        })
      }
    } else if (content.kind === 'dataPoint' || content.kind === 'contact' || content.kind === 'address') {
      const expr = content.dataPoint || content.contact || content.address
      if (pathsOf(expr).some(p => props.has(p))) {
        const id = ids.opField(facet.id, 'content')
        parts.push({ target: '#' + id, html: valueBlock(facet, row, id), swap: 'outerMorph' })
      }
    } else if (content.kind === 'table' && entities.includes(content.nav)) {
      parts.push({ target: '#' + ids.opSection(facet.id), html: facetBlock(facet, row, fullCtx, { asSection: true }), swap: 'outerMorph' })
    }
  })
  return parts.filter(p => !exclude.includes(p.target))
}

/** What a changed property does to what is shown: a facet/section/field whose `Hidden` expression reads the
 *  property is re-rendered from the fresh row (a placeholder when hidden, the content when visible; morphing
 *  leaves an unchanged one as it was), and the anchor bar follows when sections are affected. A form with a
 *  field that appears or disappears is re-rendered whole, so its columns balance as on a fresh load. */
function visibilityParts(layout, row, ctx, properties) {
  const props = new Set(properties)
  const touches = expr => !!expr && pathsOf(expr).some(p => props.has(p))
  const editMode = editModeOf(ctx, row)
  const fullCtx = { ...ctx, isDraft: editMode === 'draft', editMode }
  const parts = []
  let sectionsTouched = false
  const visit = (facets, asSection, { hidden, touched }) => {
    for (const facet of facets || []) {
      const state = {
        hidden: hidden || (facet.hidden && evaluate(facet.hidden, row) === true),
        touched: touched || touches(facet.hidden)
      }
      if (facet.kind === 'CollectionFacet') { visit(facet.facets, asSection, state); continue }
      const fieldTouched = facet.content?.kind === 'form' && facet.content.fields.some(col => touches(col.hidden))
      if (!state.touched && !fieldTouched) continue
      if (asSection) sectionsTouched = sectionsTouched || state.touched
      parts.push({
        target: '#' + (asSection ? ids.opSection(facet.id) : ids.opHeaderFacet(facet.id)), swap: 'outerMorph',
        html: facetBlock(facet, row, fullCtx, { asSection, hidden: state.hidden })
      })
    }
  }
  visit(layout.headerFacets, false, { hidden: false, touched: false })
  visit(layout.sections, true, { hidden: false, touched: false })
  if (sectionsTouched) {
    const visible = (layout.sections || []).filter(s => !(s.hidden && evaluate(s.hidden, row) === true))
    parts.push({ target: '#' + ids.opAnchor(), swap: 'outerMorph', html: anchorBar(visible) })
  }
  return parts
}

/** Does a change to these properties alter the page title (header title/description)? Returns the new
 *  title text for the browser tab, else null. */
function titleIfChanged(layout, row, ctx, properties) {
  const header = layout.header || {}
  const props = new Set(properties)
  if (![header.title, header.description].some(expr => pathsOf(expr).some(p => props.has(p)))) return null
  return String(titleOf(layout, row, ctx))
}

/** The rows of a table section as the section itself renders them (display, or draft: inputs), for its `$table` partials. */
function sectionRowsHtml(facet, rows, keyNames, ctx) {
  const nav = facet.content.nav
  const entitySetPath = `${ctx.entitySetPath}/${nav}`
  const { editing, selectable } = sectionMode(facet, ctx)
  const miniLayout = { navigable: facet.content.navigable, table: { columns: facet.content.columns } }
  const edit = editing ? { nav, rowPath: row => rowHref(ctx.basePath, entitySetPath, keyNames, row) } : undefined
  return rowsHtml(miniLayout, rows, { basePath: ctx.basePath, entitySetPath, keyNames, bundle: ctx.bundle, t: ctx.t, selectable, edit })
}

module.exports = { sectionRowsHtml, sectionGrowing, objectPageFragment, breadcrumbs, facetBlock, facetContent, footerBar, sideEffectParts, visibilityParts, titleIfChanged }
