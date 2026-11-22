const cds = require('@sap/cds')

const draftLib = require('./draft')
const actionsLib = require('./actions')

const { SELECT, UPDATE } = cds.ql

const ref = name => ({ ref: [name] })
const val = value => ({ val: value })

/** Editing a tree table (`Aggregation.RecursiveHierarchy`): moving a node below another one (Cut and Paste).
 *
 *  As in Fiori elements (observed with the Manage Categories sample): one update of the node's parent on the **active** entity, no
 *  draft involved (`PATCH Categories(ID=..,IsActiveEntity=true) {"parent@odata.bind": ...}`); the table then shows the node under
 *  its new parent. FE does nothing when a node is pasted below itself or one of its own descendants; here that is refused with a
 *  message, since a request that cannot work should say so. */

const MAX_DEPTH = 100

class MoveError extends Error {
  constructor(code) { super(code); this.code = code }
}

/** The node with this id; within `scope` (a `where` of the object's nodes, its draft's) when there is one. */
const lookup = (nodeProperty, id, scope) => scope?.length ? [ref(nodeProperty), '=', val(id), 'and', ...scope] : { [nodeProperty]: id }

/** The ids above a node, nearest first: its parent, the parent's parent, up to the top level. */
async function ancestorsOf(tx, entityType, hierarchy, id, scope) {
  const { nodeProperty, parentKey } = hierarchy
  const chain = []
  let current = id
  for (let depth = 0; current != null && depth < MAX_DEPTH; depth++) {
    const row = await tx.run(SELECT.one.from(entityType).columns(parentKey).where(lookup(nodeProperty, current, scope)))
    const parent = row?.[parentKey]
    if (parent == null) break
    chain.push(String(parent))
    current = parent
  }
  return chain
}

/** Moves the node `keys` (its full key, `IsActiveEntity` included) below `parentId`, or to the top level when `parentId` is empty.
 *  Returns the ids of the path to the node's new place (its new parent and the nodes above it), which the table opens to show it.
 *  Throws `MoveError('CYCLE')` for a move below the node itself or one of its descendants and `MoveError('NO_PARENT')` for a parent
 *  that does not exist. */
async function moveNode(tx, entityType, hierarchy, keys, parentId, { scope } = {}) {
  const { nodeProperty, parentKey } = hierarchy
  const node = String(keys[nodeProperty])
  let path = []
  if (parentId) {
    parentId = String(parentId)
    if (parentId === node) throw new MoveError('CYCLE')
    const exists = await tx.run(SELECT.one.from(entityType).columns(nodeProperty).where(lookup(nodeProperty, parentId, scope)))
    if (!exists) throw new MoveError('NO_PARENT')
    const above = await ancestorsOf(tx, entityType, hierarchy, parentId, scope)
    if (above.includes(node)) throw new MoveError('CYCLE')
    path = [parentId, ...above]
  }
  // a node of a draft (`scope`: the nodes of the draft of an object) is changed in its own draft, as FE does
  if (scope) await draftLib.patch(tx, entityType, keys, { [parentKey]: parentId || null })
  else await tx.run(UPDATE(entityType, keys).set({ [parentKey]: parentId || null }))
  return path
}

/** Puts the node `keys` before the sibling `nextId` (the last one of its siblings when empty) by calling the hierarchy's
 *  `ChangeNextSiblingAction`, as Fiori elements does for Move Up / Move Down and for dropping a node between two siblings. The node must
 *  already be below the parent it is to be ordered in (`moveNode`). Throws `MoveError('NO_SIBLING_ACTION')` without one and
 *  `MoveError('ROOTS_FIXED')` when the order of the root nodes may not change (`ChangeSiblingForRootsSupported: false`). */
async function reorder(tx, entityType, hierarchy, keys, nextId, { scope, parent } = {}) {
  if (!hierarchy.siblingAction) throw new MoveError('NO_SIBLING_ACTION')
  const { nodeProperty, parentKey } = hierarchy
  // `parent` (the node's parent id, empty for the top level) is known to a caller that has just placed the node; otherwise it is read
  if (parent === undefined) {
    const row = await tx.run(SELECT.one.from(entityType).columns(parentKey).where(lookup(nodeProperty, String(keys[nodeProperty]), scope)))
    if (!row) throw new MoveError('NO_PARENT')
    parent = row[parentKey]
  }
  if (parent == null && hierarchy.rootSiblings === false) throw new MoveError('ROOTS_FIXED')
  if (nextId) {
    const next = await tx.run(SELECT.one.from(entityType).columns(nodeProperty, parentKey).where(lookup(nodeProperty, String(nextId), scope)))
    if (!next || String(next[parentKey] ?? '') !== String(parent ?? '')) throw new MoveError('NO_PARENT') // a sibling has the same parent
  }
  await actionsLib.invokeAction(tx, hierarchy.siblingAction, keys, { NextSibling: nextId ? { [nodeProperty]: nextId } : null })
}

/** Moves a node below `parentId` (only when that is not its parent already) and then puts it before the sibling `nextId`
 *  (last when empty). Returns the ids of the path to the node, which the table opens. */
async function place(tx, entityType, hierarchy, keys, parentId, nextId, { scope } = {}) {
  const { nodeProperty, parentKey } = hierarchy
  const row = await tx.run(SELECT.one.from(entityType).columns(parentKey).where(lookup(nodeProperty, String(keys[nodeProperty]), scope)))
  if (!row) throw new MoveError('NO_PARENT')
  let path
  if (String(row[parentKey] ?? '') !== String(parentId ?? '')) path = await moveNode(tx, entityType, hierarchy, keys, parentId, { scope })
  else path = parentId ? [String(parentId), ...await ancestorsOf(tx, entityType, hierarchy, parentId, scope)] : []
  await reorder(tx, entityType, hierarchy, keys, nextId, { scope, parent: parentId || null })
  return path
}

/** The HTTP status and message key for a `MoveError`. */
const MOVE_ERRORS = { CYCLE: [409, 'CannotMoveIntoSubtree'], ROOTS_FIXED: [409, 'RootNodesFixed'], NO_PARENT: [404, 'ParentNotFound'], NO_SIBLING_ACTION: [404, 'ParentNotFound'] }

module.exports = { moveNode, reorder, place, ancestorsOf, MoveError, MOVE_ERRORS }
