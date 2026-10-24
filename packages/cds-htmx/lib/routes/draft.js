const cds = require('@sap/cds')
const cache = require('../model/cache')
const { resolveElement, backlinkElement } = require('../annotations/edm')
const keysLib = require('../keys')
const queryLib = require('../data/query')
const draftLib = require('../data/draft')
const actionsLib = require('../data/actions')
const draftMessages = require('../data/draft-messages')
const { canCreate, canEdit, canDelete } = require('../model/edit-capabilities')

/** Draft lifecycle and write routes: create, edit, save, discard, delete, actions.
 *  Mixed into `HtmxAdapter` (`Object.assign(HtmxAdapter.prototype, ...)`), so `this` is the adapter. */
module.exports = {
  /** A refused edit/save: the page stays as it is, the messages go to the page script (value states on the
   *  fields and the footer's message button, like FE). The body only clears the message strip: 4xx bodies are
   *  swapped by htmx, and an empty one would empty the page. */
  validationFailed(req, res, entityType, messages, { status = 422, contextPath } = {}) {
    const layout = cache.objectPageFor(cds.model, this.service.name, this.odataServicePath(), entityType, contextPath ?? `/${entityType.split('.').pop()}`, this.appOpts(req))
    this.trigger(res.status(status), draftMessages.triggerHeader({ set: draftMessages.labelled(messages, layout) })).type('html').send(this.messagesPartial([]))
  },

  /** `POST /:Set` (§routes: "Create (NEW draft)"): makes an empty draft and redirects straight into
   *  its (draft) Object Page, matching FE's "Create" -> edit-mode OP navigation. Draft roots only. */
  async createDraft(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode !== 'draft' || !canCreate(edit)) return this.reject(req, res, 405, 'NotAllowed')
    const pk = await draftLib.create(tx, entity.name, {})
    const keys = { ...pk, IsActiveEntity: false }
    const raw = keysLib.formatKeys(keys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${req.params.Set}(${raw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys, segments: [{ set: req.params.Set, raw }], contextPath: `/${req.params.Set}`
    })
  },

  /** `POST /:Set(keys)/:nav`: Create in a table section of a draft. Like FE (creation mode "NewPage") it makes the
   *  child's own draft row, linked to the parent through the composition's foreign key, and opens its page. */
  async createChild(req, res, tx) {
    const { set, raw: parentRaw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const parent = this.entitySet(set)
    if (!parent || parentRaw == null) return res.sendStatus(404)
    if (this.editOf(req, parent.name).mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const nav = req.params.nav
    const element = resolveElement(cds.model, parent.name, nav)
    if (!element?.target) return res.sendStatus(404)
    if (this.sectionCaps(req, parent.name, set, nav).insertable === false) return this.reject(req, res, 405, 'NotAllowed')
    const parentKeys = keysLib.parseKeys(parentRaw)
    const { IsActiveEntity: _active, ...plainParent } = parentKeys
    const assoc = backlinkElement(cds.model, element.target, parent.name)
    const defaults = assoc ? Object.fromEntries(Object.entries(plainParent).map(([k, v]) => [`${assoc}_${k}`, v])) : {}
    const childKeys = await draftLib.createChild(tx, parent.name, parentKeys, nav, defaults)
    const childRaw = keysLib.formatKeys(childKeys)
    res.set('HX-Push-Url', `${this.basePath(req)}/${set}(${parentRaw})/${nav}(${childRaw})`)
    return this.objectPage(req, res, tx, {
      entityType: element.target, keys: childKeys, segments: [{ set, raw: parentRaw }, { set: nav, raw: childRaw }], contextPath: `/${set}/${nav}`
    })
  },

  /** `POST /…(keys)/$edit` (§routes). Draft root: EDIT the active instance into a draft and show it; if
   *  the object already has your own draft, that one is resumed, someone else's draft locks it (409).
   *  Non-draft: FE V4 edits the active entity directly, so this only shows the same page in edit mode. */
  async editDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const edit = this.editOf(req, entity.name)
    const { IsActiveEntity: _active, ...plainKeys } = keys
    const current = await tx.run(SELECT.one.from(entity.name).where(edit.mode === 'draft' ? { ...plainKeys, IsActiveEntity: true } : plainKeys))
    if (!current) return res.sendStatus(404)
    if (!canEdit(edit, current)) return this.reject(req, res, 405, 'NotAllowed')

    try {
      await draftLib.edit(tx, entity.name, { ...plainKeys, IsActiveEntity: true })
    } catch (err) {
      if ((err.status ?? err.statusCode ?? err.code) !== 409) throw err
      const lockedBy = await queryLib.draftLockUser(tx, entity.name, { ...plainKeys, IsActiveEntity: false })
      if (lockedBy && lockedBy !== cds.context.user.id) {
        return this.reject(req, res, 409, 'LockedBy', lockedBy)
      }
      // your own draft: resume it
    }
    const draftKeys = { ...plainKeys, IsActiveEntity: false }
    const draftRaw = keysLib.formatKeys(draftKeys)
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${draftRaw})`)
    return this.objectPage(req, res, tx, {
      entityType: entity.name, keys: draftKeys, segments: [{ set, raw: draftRaw }], contextPath: `/${set}`
    })
  },

  /** `POST /:Set/$action/:name` (§routes Phase 5d): Invoke a bound action and re-render the OP with the result. */
  async callAction(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const actionName = req.params.name
    const keys = keysLib.parseKeys(raw)
    const params = req.body || {}

    try {
      const actionFqn = `${this.service.name}.${entity.name}.${actionName}`
      await actionsLib.invokeAction(tx, actionFqn, keys, params)
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys, segments: [{ set, raw }], contextPath: `/${set}`
      })
    } catch (err) {
      this.reject(req, res, 400, 'ActionFailed', err.message)
    }
  },

  /** `POST /…(keys)/$save` and `POST /:Set/$save` (§routes). Draft root: SAVE activates the draft, the
   *  response is the active OP plus a toast. Non-draft: Save PATCHes the active entity with the edit
   *  form, and without keys Create POSTs a new one -- straight to the active entity, as FE V4 does.
   *  Rejected input re-shows the form as typed (422) with the messages. */
  async saveDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)

    if (edit.mode === 'draft') {
      const keys = keysLib.parseKeys(raw)
      try {
        await draftLib.save(tx, entity.name, keys)
      } catch (err) {
        if (!this.constructor.isUserError(err)) throw err
        req.hfFailure = e => this.validationFailed(req, res, entity.name, draftMessages.fromError(e), { status: 422, contextPath: `/${set}` })
        throw err // roll back: CAP stores the failed activation's messages as the draft's DraftMessages
      }
      const activeKeys = { ...keys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      req.successMessage = this.text(req, 'ObjectSaved')
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    return this.reject(req, res, 405, 'NotAllowed') // only a draft root is saved: nothing else is edited
  },

  /** `POST /…(keys)/$discard` and `POST /:Set/$discard` (§routes). Draft root: DISCARD deletes the draft; a
   *  brand-new draft has nothing to go back to but the List Report, an edited one goes back to its (still
   *  existing) active OP. Non-draft: nothing was stored, so Cancel just shows the saved object again
   *  (or the List Report when cancelling a create). */
  async discardDraft(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (edit.mode !== 'draft') return this.reject(req, res, 405, 'NotAllowed')
    const keys = keysLib.parseKeys(raw)
    const { IsActiveEntity: _ignored, ...plainKeys } = keys
    const draftRow = await tx.run(SELECT.one.from(entity.name).columns('HasActiveEntity').where({ ...plainKeys, IsActiveEntity: false }))
    await draftLib.discard(tx, entity.name, keys)
    req.successMessage = this.text(req, 'DraftDiscarded')
    if (draftRow?.HasActiveEntity) {
      const activeKeys = { ...plainKeys, IsActiveEntity: true }
      const activeRaw = keysLib.formatKeys(activeKeys)
      res.set('HX-Replace-Url', `${this.basePath(req)}/${set}(${activeRaw})`)
      return this.objectPage(req, res, tx, {
        entityType: entity.name, keys: activeKeys, segments: [{ set, raw: activeRaw }], contextPath: `/${set}`
      })
    }
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
  },

  /** `DELETE /:Set(keys)` (§routes): deletes the object, then the List Report. */
  async deleteEntity(req, res, tx) {
    const { set, raw } = keysLib.splitSegments(req.params.Set)[0] || {}
    const entity = this.entitySet(set)
    if (!entity) return res.sendStatus(404)
    const keys = keysLib.parseKeys(raw)
    const edit = this.editOf(req, entity.name)
    const current = await tx.run(SELECT.one.from(entity.name).where(keys))
    if (!current) return res.sendStatus(404)
    if (!canDelete(edit, current)) return this.reject(req, res, 405, 'NotAllowed')
    await this.removeObject(tx, entity, edit, keys)
    req.successMessage = this.text(req, 'ObjectDeleted')
    res.set('HX-Replace-Url', `${this.basePath(req)}/${set}`)
    req.params.Set = set
    return this.listReport(req, res, tx)
  },

  /** `POST /:Set/$delete` (List Report Delete): deletes every ticked row (`keys=<key segment>` per row). */
  async deleteSelected(req, res, tx) {
    const entity = this.entitySet(req.params.Set)
    if (!entity) return res.sendStatus(404)
    const edit = this.editOf(req, entity.name)
    if (!canDelete(edit)) return this.reject(req, res, 405, 'NotAllowed')
    const selected = [].concat(req.body?.keys ?? []).slice(0, 200)
    if (!selected.length) return this.reject(req, res, 400, 'NotAllowed')
    for (const raw of selected) {
      const keys = keysLib.parseKeys(raw)
      const current = await tx.run(SELECT.one.from(entity.name).where(keys))
      if (!current) continue
      if (!canDelete(edit, current)) return this.reject(req, res, 405, 'NotAllowed')
      await this.removeObject(tx, entity, edit, keys)
    }
    req.successMessage = this.text(req, 'ObjectDeleted')
    return this.listReport(req, res, tx)
  },

  /** Deletes an object: a draft is discarded, anything else is DELETEd (through the service, so restrictions and handlers apply). */
  async removeObject(tx, entity, edit, keys) {
    if (edit.mode === 'draft' && keys.IsActiveEntity === false) return draftLib.discard(tx, entity.name, keys)
    return tx.run(DELETE.from(entity.name).where(keys))
  }
}
