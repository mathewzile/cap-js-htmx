const local = require('./providers/local')
const destination = require('./providers/destination')

/** The provider SPI (design doc §3). A factory takes its config entry and returns
 *  `{ kind, volatile, resolve(appId) -> { manifest, etag?, readFile(rel) -> Promise<string|null> } | null }`.
 *  Register your own with `registerSourceKind()`, e.g. for an `html5-repo` provider. */
const factories = new Map([['local', local], ['destination', destination]])

function registerSourceKind(kind, factory) {
  factories.set(kind, factory)
}

const instances = new Map() // JSON(config) -> [provider]

/** Providers for a `cds.htmx.apps.sources` list, in order (the first one that knows the app wins). */
function sourcesFor(entries) {
  const key = JSON.stringify(entries)
  let list = instances.get(key)
  if (!list) {
    list = entries.map(entry => {
      const factory = factories.get(entry.kind)
      if (!factory) throw new Error(`Unknown app source kind '${entry.kind}' (known: ${[...factories.keys()].join(', ')})`)
      return factory(entry)
    })
    instances.set(key, list)
  }
  return list
}

module.exports = { sourcesFor, registerSourceKind }
