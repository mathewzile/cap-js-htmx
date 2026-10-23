const cds = require('@sap/cds')
const { config } = require('../config')
const { sourcesFor, registerSourceKind } = require('./sources')
const { loadBundle } = require('./bundle')
const { AppError } = require('./errors')

/** `X-Htmx-App: <sap.app.id>@<applicationVersion>`. Untrusted input: this pattern is the only
 *  thing standing between a header and a source lookup, and the id never touches a path unchecked. */
const REF = /^([A-Za-z0-9._-]{1,128})@([0-9A-Za-z.+-]{1,64})$/

const registry = new Map() // app id -> { app, source, fetchedAt, checkedAt }; Map order = LRU order
const failures = new Map() // app id -> { until, error }
const pending = new Map() // app id -> Promise<entry>

const FAILURE_TTL = 5000

function parseRef(ref) {
  const m = typeof ref === 'string' && REF.exec(ref)
  if (!m) throw new AppError(400, 'Invalid X-Htmx-App')
  return { id: m[1], version: m[2] }
}

/** `apps.allow`: `["*"]`, exact ids, or a prefix with a trailing `*` (`"acme.*"`). */
function isAllowed(id) {
  return config().apps.allow.some(rule => rule === '*' || rule === id || (rule.endsWith('*') && id.startsWith(rule.slice(0, -1))))
}

/** Numeric dot-compare (`1.2.10 > 1.2.9`); `NaN` when either side isn't a plain version, which
 *  callers treat as "differs, order unknown". */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  if ([...pa, ...pb].some(Number.isNaN)) return NaN
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return Math.sign(d)
  }
  return 0
}

async function fetchApp(id) {
  for (const source of sourcesFor(config().apps.sources)) {
    const resolved = await source.resolve(id)
    if (resolved) return { source, resolved }
  }
  return null
}

async function load(id, previous) {
  const found = await fetchApp(id)
  const now = Date.now()
  if (!found) throw new AppError(404, `Unknown app '${id}'`)
  // Unchanged volatile source: keep the loaded app (and its caches) instead of rebuilding it
  if (previous && found.resolved.etag != null && found.resolved.etag === previous.app.etag) {
    return { ...previous, source: found.source, checkedAt: now }
  }
  const app = await loadBundle(found.resolved, id)
  return { app, source: found.source, fetchedAt: now, checkedAt: now }
}

function needsRefresh(entry, headerVersion, now) {
  const { ttl, refetchInterval, localRecheck } = config().apps
  // a `volatile` (local) source is re-checked for edits instead of trusted for a TTL
  if (entry.source.volatile) return now - entry.checkedAt > localRecheck
  if (now - entry.fetchedAt > ttl) return true
  // The page was built against a different version than we hold: look again, but not on every request
  return headerVersion !== entry.app.version && now - entry.fetchedAt > refetchInterval
}

/** Resolves an `X-Htmx-App` reference to a loaded `App`. Returns `{ app, outdated }`: `outdated`
 *  means the browser runs an older version than the one served (the shell then offers a reload).
 *  Concurrent requests for one app share a single load; failures are cached briefly so a broken
 *  source isn't hammered; an already-loaded app keeps being served when a refresh fails. */
async function resolve(ref) {
  const { id, version } = parseRef(ref)
  if (!isAllowed(id)) throw new AppError(403, `App '${id}' is not allowed`)

  const failed = failures.get(id)
  if (failed && failed.until > Date.now()) throw failed.error

  let entry = registry.get(id)
  if (!entry || needsRefresh(entry, version, Date.now())) {
    let job = pending.get(id)
    if (!job) {
      job = load(id, entry).finally(() => pending.delete(id))
      pending.set(id, job)
    }
    try {
      entry = await job
      failures.delete(id)
      registry.delete(id) // re-insert last: Map order is the LRU order
      registry.set(id, entry)
      while (registry.size > config().apps.maxApps) registry.delete(registry.keys().next().value)
    } catch (error) {
      if (!entry) {
        failures.set(id, { until: Date.now() + FAILURE_TTL, error })
        throw error
      }
      cds.log('htmx').error(`refreshing app ${id} failed, serving the cached version:`, error.message)
      entry.fetchedAt = entry.checkedAt = Date.now()
    }
  }
  const order = compareVersions(version, entry.app.version)
  return { app: entry.app, outdated: order < 0 || (Number.isNaN(order) && version !== entry.app.version) }
}

/** Test/ops hook: forget everything loaded or failed. */
function reset() {
  registry.clear()
  failures.clear()
  pending.clear()
}

module.exports = { resolve, parseRef, isAllowed, compareVersions, reset, registerSourceKind, AppError }
