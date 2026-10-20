const { buildCapabilities, containerTarget } = require('./list-report')
const { evaluate } = require('../annotations/expressions')

/** How an entity set can be changed, from the annotations the OData service exposes (the same ones
 *  Fiori elements V4 reads), never from CSN:
 *   - `mode: 'draft'`  a draft root (`Common.DraftRoot`): Edit creates a draft, Save activates it
 *   - `mode: 'node'`   a draft node (`Common.DraftNode`, e.g. the composition child `Chapters`):
 *                      only editable inside its draft root, never on its own
 *   - `mode: 'direct'` not draft-enabled: FE V4 edits the active entity directly. Edit only switches
 *                      the page into edit mode on the client; Save sends the changes (PATCH),
 *                      Cancel drops them; Create opens an empty page and POSTs on Save.
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

/** Create button / `POST`: a draft node can't be created on its own, only inside its root. */
function canCreate(edit) {
  return edit.mode !== 'node' && allowed(edit.insertable) && !hidden(edit.createHidden)
}

/** Edit button: the object's own `row` feeds path-based restrictions (`Updatable: {$Path: ...}`). */
function canEdit(edit, row) {
  return edit.mode !== 'node' && allowed(edit.updatable, row) && !hidden(edit.updateHidden, row)
}

function canDelete(edit, row) {
  return edit.mode !== 'node' && allowed(edit.deletable, row) && !hidden(edit.deleteHidden, row)
}

module.exports = { editCapabilities, canCreate, canEdit, canDelete }
