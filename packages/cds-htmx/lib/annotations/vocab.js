/**
 * Vocabulary alias/namespace normalization.
 *
 * CAP's own `cds.compile.to.edm()` output already uses short `Alias.Term` keys
 * (e.g. `@Common.SideEffects#Stock`), so no normalization is needed for that source.
 * Hand-authored `annotation.xml` files reference vocabularies via `edmx:Reference` /
 * `edmx:Include Alias="...">` though, and may spell a term's `@type` as a full URL
 * fragment (`...#UI.ReferenceFacet`). This module turns those spellings into the same
 * `Alias.Term` form used throughout the plugin (the `Include` aliases themselves are resolved in `xml.js`).
 */

/** Extracts the trailing `Alias.Term` from a vocabulary URL fragment, e.g.
 *  `https://sap.github.io/odata-vocabularies/vocabularies/UI.xml#UI.ReferenceFacet` -> `UI.ReferenceFacet`. */
function typeFromUrl(url) {
  if (typeof url !== 'string') return url
  const hash = url.lastIndexOf('#')
  return hash === -1 ? url : url.slice(hash + 1)
}

/** Splits a flat `$Annotations` key (`@Alias.Term`, `@Alias.Term#Qualifier`, or the compound
 *  nested form `@Alias.Term@Alias2.Term2`) into its parts. The nested form's outer term is
 *  returned as `term`/`qualifier`; `nested` carries the suffix annotations (rarely used; CAP's
 *  generic compile output for this sample model never nests terms this way, this is here so
 *  `store.js` has somewhere to put it instead of silently dropping it). */
function parseTermSegment(segment) {
  const [termPart, qualifier] = segment.split('#')
  const dot = termPart.indexOf('.')
  return {
    alias: dot === -1 ? termPart : termPart.slice(0, dot),
    term: dot === -1 ? termPart : termPart.slice(dot + 1),
    qualifier: qualifier || undefined
  }
}

function parseAnnotationKey(key) {
  if (key[0] !== '@') return null
  const [head, ...nested] = key.slice(1).split('@')
  return {
    ...parseTermSegment(head),
    nested: nested.length ? nested.map(parseTermSegment) : undefined
  }
}

module.exports = { typeFromUrl, parseAnnotationKey }
