const cds = require('@sap/cds')

/** @type {Map<string, { res: import('express').Response, user: any, locale: string, app: string|null, view: object, views: Map<number, object> }>} */
const clients = new Map()

/** What a page showed when it was rendered, for pages opened directly (deep link, reload): their SSE
 *  channel connects after the render, and until a later htmx request carries the client header nothing
 *  else would say what they display. Taken over when the channel connects, dropped if it never does. */
const pending = new Map()

/** A client id is only good for the user it was created for: another user who learns the id can neither
 *  change the view nor take over the channel. */
const sameUser = (a, b) => (a?.id ?? null) === (b?.id ?? null)

/** The views a page shows, one per Flexible Column Layout column (`view.column`; a page without columns has one, 0). A page
 *  rendered into a column replaces what that column showed and closes the columns after it (they were opened from the old page).
 *  Returns the new map; `views` is not changed. */
function mergeViews(views, view) {
  const column = view.column ?? 0
  const next = new Map()
  for (const [c, v] of views ?? []) if (c < column) next.set(c, v)
  next.set(column, view)
  return next
}

function rememberView(clientId, view, user = cds.context?.user) {
  if (!view) return
  const before = pending.get(clientId)
  const entry = { view, views: mergeViews(before && sameUser(before.user, user) ? before.views : null, view), user }
  pending.set(clientId, entry)
  // an earlier timer must not drop a view that was remembered again later
  setTimeout(() => { if (pending.get(clientId) === entry) pending.delete(clientId) }, 60000).unref()
}

function takePending(clientId, user = cds.context?.user) {
  const entry = pending.get(clientId)
  if (!entry || !sameUser(entry.user, user)) return null
  pending.delete(clientId)
  return { view: entry.view, views: entry.views }
}

function add(clientId, client) {
  clients.set(clientId, client)
}

/** Closing an old connection of a client id must not remove the one that replaced it (a reconnect). */
function remove(clientId, res) {
  if (!res || clients.get(clientId)?.res === res) clients.delete(clientId)
}

function get(clientId) {
  return clients.get(clientId)
}

/** The channel of `clientId` if it belongs to `user` (default: the current request's). */
function forUser(clientId, user = cds.context?.user) {
  const client = clients.get(clientId)
  return client && sameUser(client.user, user) ? client : undefined
}

function setView(clientId, view) {
  const client = forUser(clientId)
  if (!client) return
  client.view = view
  client.views = mergeViews(client.views, view)
}

function all() {
  return clients.values()
}

function closeAll() {
  for (const { res } of clients.values()) {
    try { res.end() } catch { /* ignore */ }
  }
  clients.clear()
}

module.exports = {
  mergeViews, clients, rememberView, takePending, add, remove, get, forUser, setView, all, closeAll, newClientId: () => cds.utils.uuid() }
