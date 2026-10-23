const { buildCapabilities, containerTarget } = require('./list-report')
const { evaluate } = require('../annotations/expressions')

/** How an entity set can be changed, from the annotations the OData service exposes (the same ones
 *  Fiori elements V4 reads), never from CSN:
 *   - `mode: 'draft'`  a draft root (`Common.DraftRoot`): Edit creates a draft, Save activates it
 *   - `mode: 'node'`   a draft node (`Common.DraftNode`, e.g. the composition child `Chapters`):
 *                      only editable inside its draft root, never on its own
 *   - `mode: 'direct'` not draft-enabled: like FE V4 (which needs a draft or a sticky session to edit or create), the
 *                      entity can only be shown and deleted: no Edit, no Create. Enable `@odata.draft.enabled`
 *                      to make it editable.
 *  `insertable`/`updatable`/`deletable` are the `Capabilities.*Restrictions` values (boolean or a
 *  per-object expression, `@readonly` compiles to `false`), `*Hidden` the `UI.*Hidden` ones. */
function editCapabilities(store, entityType) {
  const container = store.raw(containerTarget(entityType))
  const type = store.raw(entityType)
  const caps = buildCapabilities(store, entityType)
  const draftRoot = !!container['@Common.DraftRoot']
  const draftNode = !draftRoot && !!container['@Common.DraftNode']
  return {
    mode: draftRoot ? 'draft' : draftNode ? 'node' : 'direct',
    insertable: caps.insert?.Insertable ?? true,
    updatable: caps.update?.Updatable ?? true,
    deletable: caps.delete?.Deletable ?? true,
    createHidden: type['@UI.CreateHidden'],
    updateHidden: type['@UI.UpdateHidden'],
    deleteHidden: type['@UI.DeleteHidden']
  }
}

const allowed = (value, row) => evaluate(value, row ?? {}) !== false
const hidden = (value, row) => value != null && evaluate(value, row ?? {}) === true

/** Create button / `POST`: only a draft root is created (a draft node only inside its root, a non-draft entity not at all). */
function canCreate(edit) {
  return edit.mode === 'draft' && allowed(edit.insertable) && !hidden(edit.createHidden)
}

/** Edit button: the object's own `row` feeds path-based restrictions (`Updatable: {$Path: ...}`). */
function canEdit(edit, row) {
  return edit.mode === 'draft' && allowed(edit.updatable, row) && !hidden(edit.updateHidden, row)
}

function canDelete(edit, row) {
  return edit.mode !== 'node' && allowed(edit.deletable, row) && !hidden(edit.deleteHidden, row)
}

module.exports = { editCapabilities, canCreate, canEdit, canDelete }
