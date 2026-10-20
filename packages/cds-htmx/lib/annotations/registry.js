const UI = require('./terms/ui')
const Common = require('./terms/common')
const Communication = require('./terms/communication')
const Capabilities = require('./terms/capabilities')
const Core = require('./terms/core')
const Measures = require('./terms/measures')
const Validation = require('./terms/validation')
const HTML5 = require('./terms/html5')

const BY_ALIAS = { UI, Common, Communication, Capabilities, Core, Measures, Validation, HTML5 }

/** Whole vocabularies out of scope for v1 (§3.2: "ignored v1"): any term under these aliases
 *  is `ignored` regardless of which specific term it is. */
const IGNORED_ALIASES = new Set(['Analytics', 'Aggregation', 'Session'])

/** `supported | partial | ignored | unknown` for one `Alias.Term`. Unlisted terms under a known
 *  vocabulary, and terms under vocabularies we don't recognize at all, are `unknown`: the plugin
 *  found an annotation it has no opinion about and silently drops instead of rendering. */
function statusOf(alias, term) {
  if (IGNORED_ALIASES.has(alias)) return 'ignored'
  return BY_ALIAS[alias]?.[term] || 'unknown'
}

/** Walks every target in the store and classifies each of its top-level terms, returning
 *  `{supported, partial, ignored, unknown}`, each a list of `{target, alias, term, qualifier}`.
 *  `GET /$coverage` renders this; a unit test asserts `unknown` is empty for the sample model. */
function coverage(store) {
  const report = { supported: [], partial: [], ignored: [], unknown: [] }
  for (const target of Object.keys(store.targets)) {
    for (const { alias, term, qualifier } of store.terms(target)) {
      const status = statusOf(alias, term)
      report[status].push({ target, alias, term, qualifier })
    }
  }
  return report
}

module.exports = { statusOf, coverage, BY_ALIAS, IGNORED_ALIASES }
