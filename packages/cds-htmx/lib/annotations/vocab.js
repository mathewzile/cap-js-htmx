/**
 * Vocabulary alias/namespace normalization.
 *
 * CAP's own `cds.compile.to.edm()` output already uses short `Alias.Term` keys
 * (e.g. `@Common.SideEffects#Stock`), so no normalization is needed for that source.
 * Hand-authored `annotation.xml` files reference vocabularies via `edmx:Reference` /
 * `edmx:Include Alias="...">` though, and may spell a term's `@type` as a full URL
 * fragment (`...#UI.ReferenceFacet`). This module is the single place that turns any
 * of those spellings into the same `Alias.Term` form used throughout the plugin.
 */

/** Namespace → default alias, used when an annotation.xml Include omits Alias (rare) or as a fallback. */
const DEFAULT_ALIASES = {
  'com.sap.vocabularies.UI.v1': 'UI',
  'com.sap.vocabularies.Common.v1': 'Common',
  'com.sap.vocabularies.Communication.v1': 'Communication',
  'com.sap.vocabularies.Capabilities.v1': 'Capabilities',
  'com.sap.vocabularies.Analytics.v1': 'Analytics',
  'com.sap.vocabularies.PersonalData.v1': 'PersonalData',
  'com.sap.vocabularies.Session.v1': 'Session',
  'com.sap.vocabularies.HTML5.v1': 'HTML5',
  'Org.OData.Core.V1': 'Core',
  'Org.OData.Measures.V1': 'Measures',
  'Org.OData.Validation.V1': 'Validation',
  'Org.OData.Capabilities.V1': 'Capabilities',
  'Org.OData.Aggregation.V1': 'Aggregation'
}

/** The default record $Type for members of well-known annotation collections, used when a
 *  Record omits an explicit Type (as CAP's own compiler output does for the common case). */
const DEFAULT_RECORD_TYPES = {
  'UI.LineItem': 'UI.DataField',
  'UI.Facets': 'UI.ReferenceFacet',
  'UI.HeaderFacets': 'UI.ReferenceFacet',
  'UI.Identification': 'UI.DataField',
  'UI.FieldGroup.Data': 'UI.DataField',
  'UI.SelectionFields': 'UI.DataField',
  'Common.ValueList.Parameters': 'Common.ValueListParameterInOut'
}

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

/** Alias.Term key, with optional qualifier, e.g. `common('SideEffects','Stock')` -> `Common.SideEffects#Stock`. */
function qualifiedTerm(alias, term, qualifier) {
  return qualifier ? `${alias}.${term}#${qualifier}` : `${alias}.${term}`
}

function defaultRecordType(contextTerm) {
  return DEFAULT_RECORD_TYPES[contextTerm]
}

module.exports = { DEFAULT_ALIASES, DEFAULT_RECORD_TYPES, typeFromUrl, parseAnnotationKey, qualifiedTerm, defaultRecordType }
