const cds = require('@sap/cds')

/** @type {Map<string, { res: import('express').Response, user: any, locale: string, app: string|null, view: object }>} */
const clients = new Map()

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

module.exports = { clients, add, remove, get, setView, all, closeAll, newClientId: () => cds.utils.uuid() }
