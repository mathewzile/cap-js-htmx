const cds = require('@sap/cds')

/** @type {Map<string, { res: import('express').Response, user: any, locale: string, app: string|null, view: object }>} */
const clients = new Map()

/** What a page showed when it was rendered, for pages opened directly (deep link, reload): their SSE
 *  channel connects after the render, and until a later htmx request carries the client header nothing
 *  else would say what they display. Taken over when the channel connects, dropped if it never does. */
const pending = new Map()

function rememberView(clientId, view) {
  if (!view) return
  pending.set(clientId, view)
  setTimeout(() => pending.delete(clientId), 60000).unref()
}

function takePending(clientId) {
  const view = pending.get(clientId) ?? null
  pending.delete(clientId)
  return view
}

function add(clientId, client) {
  clients.set(clientId, client)
}

function remove(clientId) {
  clients.delete(clientId)
}

function get(clientId) {
  return clients.get(clientId)
}

function setView(clientId, view) {
  const client = clients.get(clientId)
  if (client) client.view = view
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

module.exports = { clients, rememberView, takePending, add, remove, get, setView, all, closeAll, newClientId: () => cds.utils.uuid() }
