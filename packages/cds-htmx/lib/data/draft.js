const cds = require('@sap/cds')

/** Thin wrappers over the lean-draft runtime's own convenience methods (`srv.new/edit/save/discard`,
 *  installed onto the service instance by `@sap/cds/libx/_runtime/fiori/lean-draft.js` whenever the
 *  service has a `DraftAdministrativeData` entity). Verified live against that source (Oct 2026):
 *   - `new`/`save`/`cancel`/`discard` all dispatch against the **drafts** entity (`Entity.drafts`) --
 *     their handlers (`onNew`/`onCancel`) early-return via `if (!req.target.isDraft) return next?.()`.
 *   - `edit` dispatches against the **active** entity (`onEdit`: `if (req.target.isDraft) return next?.()`).
 *   - A plain `UPDATE(Entity).set(data).where({...keys, IsActiveEntity:false})`, run through the
 *     service transaction, is itself routed to the "patch draft" branch inside `draftHandle`
 *     (`req.event === 'UPDATE' && req.target.drafts`) -- no special PATCH event needed.
 *  All calls go through `tx` (the transaction bound to the current request), never `cds.db`, so
 *  `@restrict`, validation and custom handlers apply exactly as they would via OData. */

function entityDef(entityType) {
  return cds.model.definitions[entityType]
}

/** `NEW`: creates an empty draft (optionally pre-filled via `data`) and returns just its keys
 *  (`{ID, IsActiveEntity:false, ...}` -- `onNew` never returns the full row). Callers re-read the
 *  row themselves afterwards via the normal Object Page query, same as every other route. */
async function create(tx, entityType, data = {}) {
  const Entity = entityDef(entityType)
  const result = await tx.new(Entity.drafts, data)
  return result[0]
}

/** `EDIT`: copies the active instance into a new draft. `keys` identifies the active instance's
 *  key -- `IsActiveEntity` is stripped (not just "true", any value) because it's a *virtual*
 *  element on a draft-enabled entity: embedding it in `onEdit`'s internal `SELECT.from(target,
 *  keys)` throws cqn4sql's "Virtual elements are not allowed in expressions" (verified live). */
async function edit(tx, entityType, keys) {
  const Entity = entityDef(entityType)
  const { IsActiveEntity: _ignored, ...plainKeys } = keys
  return tx.edit(Entity, plainKeys)
}

/** Patches one or more fields of an existing draft (`keys` identifies the active entity's key,
 *  i.e. without `IsActiveEntity` -- this function adds `IsActiveEntity:false` itself). */
async function patch(tx, entityType, keys, data) {
  const Entity = entityDef(entityType)
  const { IsActiveEntity: _ignored, ...plainKeys } = keys
  return tx.run(UPDATE(Entity).set(data).where({ ...plainKeys, IsActiveEntity: false }))
}

/** `SAVE` (-> `draftActivate`): activates the draft into the active instance, deleting the draft
 *  afterwards. `keys` identifies the root entity (`IsActiveEntity` not required in the data). */
async function save(tx, entityType, keys) {
  const Entity = entityDef(entityType)
  const { IsActiveEntity: _ignored, ...plainKeys } = keys
  return tx.save(Entity.drafts, plainKeys)
}

/** `DISCARD` (-> `CANCEL`): deletes the draft (and, if it was a brand-new draft with no active
 *  counterpart, there is nothing left to navigate back to but the List Report). */
async function discard(tx, entityType, keys) {
  const Entity = entityDef(entityType)
  const { IsActiveEntity: _ignored, ...plainKeys } = keys
  return tx.discard(Entity.drafts, plainKeys)
}

module.exports = { create, edit, patch, save, discard }
