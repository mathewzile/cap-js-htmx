const cds = require('@sap/cds')
const { tableFacets } = require('../data/page')
const fieldsLib = require('../model/fields')
const { isMandatory, isReadOnly } = require('../render/field')
const { coerce, InputError } = require('../data/form')
const { partial } = require('../render/html')
const cache = require('../model/cache')
const i18n = require('../i18n')
const { entityDef, resolveElement, backlinkElement } = require('../annotations/edm')
const keysLib = require('../keys')
const draftLib = require('../data/draft')
const valueListLib = require('../data/value-list')
const draftMessages = require('../data/draft-messages')
const ids = require('../render/ids')
const valueHelpRender = require('../render/value-help')
const engine = require('../sse/side-effects-engine')

/** Field-level routes of a draft: PATCH of a field or a cell, rows of a section, value help.
 *  Mixed into `HtmxAdapter` (`Object.assign(HtmxAdapter.prototype, ...)`), so `this` is the adapter. */
module.exports = {
  /** `PATCH /…(keys)/$field/:path` (§routes): patches one draft field. The response carries the other
   *  places showing the same property (header title, other facets) as `<hx-partial>`s, so the page reflects
   *  the draft immediately; annotated `Common.SideEffects` follow over SSE after the response. */
  async patchField(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    if (this.editOf(req, entity.name).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const keys = keysLib.parseKeys(raw)
    const path = req.params.path
    const value = req.body?.[path]
    // A key typed into a value-help field has to exist in its value list (the draft is not changed otherwise)
    const field = fieldsLib.buildField(cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req)), entity.name, path)
    if (field?.valueList && !field.fixedValues && !(await valueListLib.keyExists(tx, field.valueList, value))) {
      return this.validationFailed(req, res, entity.name, [{ path, text: this.text(req, 'InvalidValue'), severity: 'error' }], { status: 422, contextPath: `/${set}` })
    }
    try {
      await draftLib.patch(tx, entity.name, keys, { [path]: value })
    } catch (err) {
      if (!this.constructor.isUserError(err)) throw err
      return this.validationFailed(req, res, entity.name, [{ ...draftMessages.fromError(err)[0], path }], { status: 422, contextPath: `/${set}` })
    }
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys, contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath: `${set}(${raw})` }
    const header = req.headers['x-hf-source']
    const source = typeof header === 'string' && /^[\w-]+$/.test(header) ? header : null
    const { parts, layout, row, title } = await engine.bindingParts(tx, view, { path, source, ...this.appOpts(req) })
      .catch(err => { cds.log('htmx').error('binding refresh for', path, 'failed:', err.message); return { parts: [], layout: null, row: null, title: null } })
    // The value is valid again (clear its message) unless it is a mandatory field the user emptied
    const missing = layout ? draftMessages.missingMandatory(layout, row, [path], this.text(req, 'MissingValue')) : []
    this.trigger(res, draftMessages.triggerHeader({ clear: [path], set: draftMessages.labelled(missing, layout ?? {}), title }))
    const status = partial(`#${ids.opDraftStatus()}`, 'innerHTML', this.text(req, 'DraftSavedStatus'))
    // clears a stale validation strip as well
    const markup = [this.messagesPartial([]), status, ...(parts.length ? [engine.partialsMarkup(parts)] : [])].join('\n')
    res.status(200).type('html').send(markup)
    // The response is out; annotated side effects are pushed over SSE inside this same transaction, so they see the patch
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    // the page asks for the effects to wait until the focus leaves the field group (`POST $effects` then runs them)
    if (req.headers['x-hf-defer'] === '1') return engine.defer(clientId, view.entitySetPath, path)
    await engine.onChange(tx, view, { clientId, properties: [path] })
      .catch(err => cds.log('sse').error('side effects for', path, 'failed:', err.message))
  },

  /** Parses a path below a draft root: `Books(k)/chapters(k2)` followed by `/$field/title` (a change) or
   *  `/$delete` (a bulk delete), or nothing (the child itself). Walks the navigation chain structurally
   *  (CSN) like `subObjectPage`. Returns the child's entity type and keys, the parent it belongs to and the
   *  key string the client uses for this row (`chapters(ID='…',IsActiveEntity=false)`). */
  parseNested(req) {
    let full = (req.params.splat || []).join('/')
    let action = null
    let property = null
    const field = /\/\$field\/(\w+)$/.exec(full)
    if (field) { action = 'field'; property = field[1]; full = full.slice(0, field.index) } else if (/\/\$delete$/.test(full)) { action = 'delete'; full = full.slice(0, -'/$delete'.length) } else if (/\/\$paste$/.test(full)) { action = 'paste'; full = full.slice(0, -'/$paste'.length) }
    const segments = keysLib.splitSegments(full)
    if (segments.length < 2 || segments[0].raw == null) return null
    const top = this.entitySet(segments[0].set)
    if (!top) return null
    const types = [top.name]
    for (let i = 1; i < segments.length; i++) {
      const element = resolveElement(cds.model, types[i - 1], segments[i].set)
      if (!element?.target) return null
      types.push(element.target)
    }
    const last = segments.length - 1
    const target = segments[last]
    const parentSegments = segments.slice(0, last)
    const pathOf = segs => segs.map(s => `${s.set}${s.raw ? `(${s.raw})` : ''}`).join('/')
    return {
      action, property, segments, nav: target.set,
      root: { set: segments[0].set, raw: segments[0].raw, entityType: top.name, keys: keysLib.parseKeys(segments[0].raw) },
      entityType: types[last], raw: target.raw, keys: target.raw == null ? null : keysLib.parseKeys(target.raw),
      parent: { entityType: types[last - 1], segments: parentSegments, path: pathOf(parentSegments), keys: keysLib.parseKeys(parentSegments[last - 1].raw), contextPath: `/${segments[0].set}${parentSegments.slice(1).map(s => `/${s.set}`).join('')}` },
      rowKey: target.raw == null ? null : `${target.set}(${target.raw})`,
      path: pathOf(segments)
    }
  },

  /** The parent page again (after a child row changed or was deleted), with its own URL pushed. */
  parentPage(req, res, tx, n, { push }) {
    if (push) res.set('HX-Replace-Url', `${this.basePath(req)}/${n.parent.path}`)
    return this.objectPage(req, res, tx, { entityType: n.parent.entityType, keys: n.parent.keys, segments: n.parent.segments, contextPath: n.parent.contextPath })
  },

  /** `POST /:Set(keys)/$effects`: the focus left a field group, so the side effects of the changes made in it run now (what the
   *  PATCHes with `X-Hf-Defer` left waiting for this page and object). Answers 204 whether or not something was waiting. */
  async flushEffects(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    const clientId = req.headers['x-htmx-client']
    if (!entity || raw == null || typeof clientId !== 'string') return res.sendStatus(404)
    const entitySetPath = `${set}(${raw})`
    const properties = engine.takeDeferred(clientId, entitySetPath)
    if (properties.length) {
      const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: entity.name, keys: keysLib.parseKeys(raw), contextPath: `/${set}`, basePath: this.basePath(req), entitySetPath }
      await engine.onChange(tx, view, { clientId, properties })
        .catch(err => cds.log('sse').error('side effects for', properties.join(','), 'failed:', err.message))
    }
    res.sendStatus(204)
  },

  /** `PATCH …/chapters(k)/$field/:path`: a cell of a child row, or a field of a child page, in a draft. The
   *  child is its own draft entity (`IsActiveEntity=false`); mandatory cells get a value state like FE. */
  async patchNested(req, res, tx) {
    const n = this.parseNested(req)
    if (!n || n.action !== 'field' || !n.keys) return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    if (this.editOf(req, n.entityType).updatable === false || (n.segments.length === 2 && this.sectionCaps(req, n.root.entityType, n.root.set, n.nav).updatable === false)) return this.reject(req, res, 405, 'NotAllowed')
    const key = `${n.rowKey}.${n.property}`
    try {
      await draftLib.patch(tx, n.entityType, n.keys, { [n.property]: req.body?.[n.property] })
    } catch (err) {
      if (!this.constructor.isUserError(err)) throw err
      return this.validationFailed(req, res, n.root.entityType, [{ ...draftMessages.fromError(err)[0], path: key }], { status: 422, contextPath: `/${n.root.set}` })
    }
    const header = req.headers['x-hf-source']
    const source = typeof header === 'string' && /^[\w-]+$/.test(header) ? header : null
    const ownPage = ids.unprefixed(source ?? '').startsWith('op-field--')
    // a field of the child's own page is in the child's column, a cell of a table section is in its parent's
    if (this.fclOf(req, n.root.set)) ids.setColumn(ownPage ? n.segments.length : n.segments.length - 1)
    const status = partial(`#${ids.opDraftStatus()}`, 'innerHTML', this.text(req, 'DraftSavedStatus'))
    if (ownPage) {
      // A field of the child's own page: same as a field of the root page (other occurrences, header title, validation)
      const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: n.entityType, keys: n.keys, contextPath: n.parent.contextPath + `/${n.nav}`, basePath: this.basePath(req), entitySetPath: n.path }
      const { parts, layout: childLayout, row: childRow } = await engine.bindingParts(tx, view, { path: n.property, source, ...this.appOpts(req) })
        .catch(err => { cds.log('htmx').error('binding refresh for', n.property, 'failed:', err.message); return { parts: [], layout: null, row: null } })
      const missingField = childLayout ? draftMessages.missingMandatory(childLayout, childRow, [n.property], this.text(req, 'MissingValue')) : []
      this.trigger(res, draftMessages.triggerHeader({ clear: [n.property], set: draftMessages.labelled(missingField, childLayout ?? {}) }))
      res.status(200).type('html').send([this.messagesPartial([]), status, ...(parts.length ? [engine.partialsMarkup(parts)] : [])].join('\n'))
    } else {
      // A cell of the table section that shows this row: a mandatory cell the user emptied is flagged
      const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), n.root.entityType, `/${n.root.set}`, this.appOpts(req))
      const column = tableFacets(layout)
        .find(f => f.content.nav === n.nav)?.content.columns.find(c => c.field?.path === n.property)
      const { IsActiveEntity: _a, ...plain } = n.keys
      const row = await tx.run(SELECT.one.from(n.entityType).where(entityDef(cds.model, n.entityType)?.elements?.IsActiveEntity ? { ...plain, IsActiveEntity: false } : plain))
      const missing = column && row && isMandatory(column.field, row) && draftMessages.isEmpty(row[column.field.cqlPath])
        ? [{ path: key, text: this.text(req, 'MissingValue'), severity: 'error', label: column.field.label }] : []
      this.trigger(res, draftMessages.triggerHeader({ clear: [key], set: missing }))
      res.status(200).type('html').send([this.messagesPartial([]), status].join('\n'))
    }
    // Annotated side effects of the root (e.g. Chapters -> totalPages) are pushed over SSE after the response
    const clientId = req.headers['x-htmx-client']
    if (!clientId) return
    const view = { service: this.service.name, servicePath: this.odataServicePath(), entityType: n.root.entityType, keys: n.root.keys, contextPath: `/${n.root.set}`, basePath: this.basePath(req), entitySetPath: `${n.root.set}(${n.root.raw})` }
    await engine.onChange(tx, view, { clientId, navigations: [n.segments[1].set] })
      .catch(err => cds.log('sse').error('side effects for', n.nav, 'failed:', err.message))
  },

  /** `POST …/chapters/$delete`: deletes the ticked rows of a table section of the draft: the draft rows of a composition (CANCEL of
   *  the child draft, the saved row stays until the root is saved), the rows of an association table (a non-draft entity such as
   *  Authors.books) for real, like FE. */
  async postNested(req, res, tx) {
    const n = this.parseNested(req)
    if (n?.action === 'paste') return this.pasteRows(req, res, tx, n)
    if (!n || n.action !== 'delete') return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    if (this.editOf(req, n.entityType).deletable === false || (n.segments.length === 2 && this.sectionCaps(req, n.root.entityType, n.root.set, n.nav).deletable === false)) return this.reject(req, res, 405, 'NotAllowed')
    const draftNode = !!entityDef(cds.model, n.entityType)?.elements?.IsActiveEntity
    for (const raw of [].concat(req.body?.keys ?? []).slice(0, 200)) {
      const keys = keysLib.parseKeys(raw)
      if (draftNode) await draftLib.discard(tx, n.entityType, keys)
      else await tx.run(DELETE.from(n.entityType).where(keys))
    }
    // the segment list of the section is the parent's own
    return this.objectPage(req, res, tx, { entityType: n.parent.entityType, keys: n.parent.keys, segments: n.parent.segments, contextPath: n.parent.contextPath })
  },

  /** `POST …/chapters/$paste` (FE: paste rows from a spreadsheet into a table of the draft). `cols` names the
   *  columns the pasted cells belong to (JSON array of properties), `rows` the pasted rows (JSON array of arrays of
   *  text). Only editable columns of this table are taken; every row is converted first, so nothing is created when one
   *  cell is invalid. One child draft per row, linked to the parent like Create. */
  async pasteRows(req, res, tx, n) {
    if (n.segments.length !== 2 || n.raw != null) return res.sendStatus(404)
    if (this.editOf(req, n.root.entityType).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const caps = this.sectionCaps(req, n.root.entityType, n.root.set, n.nav)
    if (caps.insertable === false || caps.updatable === false) return this.reject(req, res, 405, 'NotAllowed')
    let cols, rows
    try { cols = JSON.parse(req.body?.cols); rows = JSON.parse(req.body?.rows) } catch { return res.sendStatus(400) }
    if (!Array.isArray(cols) || !Array.isArray(rows) || rows.length > 200 || rows.some(r => !Array.isArray(r))) return res.sendStatus(400)

    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), n.root.entityType, `/${n.root.set}`, this.appOpts(req))
    const columns = tableFacets(layout)
      .find(f => f.content.nav === n.nav)?.content.columns || []
    const editable = new Map(columns.filter(c => c.kind === 'UI.DataField' && c.field?.cqlPath && !c.field.cqlPath.includes('.') && !isReadOnly(c.field, {}, 'draft')).map(c => [c.field.path, c.field]))
    const picked = cols.map(c => editable.get(c) ?? null)

    const assoc = backlinkElement(cds.model, n.entityType, n.root.entityType)
    const { IsActiveEntity: _a, ...plainParent } = n.root.keys
    const defaults = assoc ? Object.fromEntries(Object.entries(plainParent).map(([k, v]) => [`${assoc}_${k}`, v])) : {}
    let data
    try {
      data = rows.map(cells => {
        const values = { ...defaults }
        picked.forEach((field, i) => {
          if (!field || cells[i] == null) return
          const element = resolveElement(cds.model, n.entityType, field.cqlPath)
          values[field.cqlPath] = coerce(element, String(cells[i]).trim(), field.label || field.path, field.path)
        })
        return values
      })
    } catch (err) {
      if (!(err instanceof InputError)) throw err
      return this.reject(req, res, 422, 'PasteInvalid', err.message)
    }
    for (const values of data) await draftLib.createChild(tx, n.root.entityType, n.root.keys, n.nav, values)
    return this.parentPage(req, res, tx, n, { push: false })
  },

  /** `GET /:Set/$vh/:path?$search=...` (§routes): Value-help dialog for @Common.ValueList (unbounded, searchable). */
  async valueHelp(req, res, tx) {
    const { set } = keysLib.splitSegments(req.params.Set)[0] || {}
    const { raw: keyRaw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const path = req.params.path
    const search = String(req.query.$search || '')
    const target = /^[\w.]+$/.test(String(req.query.target || '')) ? String(req.query.target) : path

    const store = cache.storeFor(cds.model, this.service.name, this.odataServicePath(), this.appOpts(req))
    const field = fieldsLib.buildField(store, entity.name, path)
    const parsed = valueListLib.parseValueList(field?.valueList)
    if (!parsed) return res.sendStatus(404)
    const { collectionPath, valueProp, columns: props, searchSupported } = parsed

    // Column headers: the value list entity's own labels (Common.Label), like FE's table
    const collectionType = collectionPath.includes('.') ? collectionPath : `${this.service.name}.${collectionPath}`
    const bundle = cache.bundleFor(this.appOpts(req))
    const labelOf = label => i18n.resolveText(label, bundle) // labels are still {i18n>Key} placeholders here
    const columns = props.map(prop => {
      const label = labelOf(fieldsLib.buildField(store, collectionType, prop)?.label ?? prop)
      return { prop, label, spec: require('../render/column-width').widthSpec({ kind: 'UI.DataField', label, field: { path: prop } }, collectionType) }
    })
    const multi = /^f\./.test(target) // a filter field takes several values
    const suggest = req.query.mode === 'suggest'
    let q = SELECT.from(collectionPath).columns(props)
    if (search && searchSupported) q = q.search(search)
    const limit = suggest ? 8 : 200
    // per-column filters of the dialog ("Show Filters"): `c.<column>` contains, columns whitelisted from the value list
    const columnFilters = {}
    for (const prop of props) {
      const v = req.query[`c.${prop}`]
      if (typeof v === 'string' && v.trim()) { columnFilters[prop] = v.trim(); q = q.where(`${prop} like`, `%${v.trim()}%`) }
    }
    let rows = await tx.run(q.limit(limit))
    if (search && searchSupported && !Object.keys(columnFilters).length) {
      // `$search` only covers the text columns; what is typed is often the key itself (a UUID is not searched)
      try {
        const byKey = await tx.run(SELECT.from(collectionPath).columns(props).where(`${valueProp} like`, `%${search}%`).limit(limit))
        const seen = new Set(rows.map(r => r[valueProp]))
        rows = [...rows, ...byKey.filter(r => !seen.has(r[valueProp]))].slice(0, limit)
      } catch { /* key type not comparable with text: the search result stands */ }
    }

    const t = key => i18n.t(bundle, key)
    // Type-ahead under the input while typing: the best matches only
    if (suggest) return res.type('html').send(String(valueHelpRender.valueHelpSuggest(columns, rows, { valueProp, t })))
    // Searching only replaces the results, opening sends the whole dialog (into #dialogs)
    if (req.query.mode === 'results') {
      return res.type('html').send(String(valueHelpRender.valueHelpResults(columns, rows, { valueProp, t, multi })))
    }
    const entitySetPath = keyRaw ? `${set}(${keyRaw})` : set
    res.type('html').send(String(valueHelpRender.valueHelpDialog({ ...field, label: labelOf(field.label) }, columns, rows, { basePath: this.basePath(req), entitySetPath, valueProp, search, searchSupported, t, target, filters: columnFilters })))
  }
}
