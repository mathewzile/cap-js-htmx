const { buildColumn } = require('./list-report')
const feDefaults = require('./fe-defaults')
const { typeFromUrl } = require('../annotations/vocab')
const { resolveElement } = require('../annotations/edm')

/** `@UI.FieldGroup#Extra` / `@Communication.Contact` -> `{ termKey: 'UI.FieldGroup', qualifier: 'Extra' }`,
 *  the shape `AnnotationStore.get(target, term, qualifier)` expects. Returns `undefined` for anything
 *  that isn't an own-entity annotation-path reference (e.g. a navigation-path target). */
function parseAnnotationPathTarget(target) {
  const m = typeof target === 'string' && target.match(/^@([\w.]+)(?:#(.+))?$/)
  if (!m) return undefined
  const [, termKey, qualifier] = m
  return { termKey, term: termKey.slice(termKey.indexOf('.') + 1), qualifier }
}

/** A `nav/@UI.LineItem`-shaped facet target (sub-object-page / inline table section, §3.2
 *  Facets row) -> the navigation segment, e.g. `chapters/@UI.LineItem` -> `chapters`. */
function parseNavigationLineItemTarget(target) {
  if (typeof target !== 'string' || !target.endsWith('/@UI.LineItem')) return undefined
  return target.slice(0, -'/@UI.LineItem'.length)
}

/** One `Facets`/`HeaderFacets` entry -> a section/subsection content descriptor (§3.2: Facets row).
 *  `model` is CSN, used only to resolve a navigation facet's target entity type (structural typing,
 *  not annotation data -- the layout model itself still comes only from the store). */
function buildFacet(model, store, entityType, facet) {
  const kind = typeFromUrl(facet['@type']) || 'UI.ReferenceFacet'
  const base = {
    id: facet.ID,
    label: facet.Label,
    importance: facet['@UI.Importance'],
    hidden: facet['@UI.Hidden'],
    partOfPreview: facet['@UI.PartOfPreview'] !== false
  }

  if (kind === 'UI.CollectionFacet') {
    return { ...base, kind: 'CollectionFacet', facets: (facet.Facets || []).map(f => buildFacet(model, store, entityType, f)) }
  }

  const nav = parseNavigationLineItemTarget(facet.Target)
  if (nav) {
    const element = resolveElement(model, entityType, nav)
    const targetEntityType = element?.target
    const columns = targetEntityType
      ? (store.get(targetEntityType, 'UI.LineItem') || []).map(r => buildColumn(store, targetEntityType, r))
      : []
    return { ...base, kind: 'ReferenceFacet', content: { kind: 'table', nav, targetEntityType, columns } }
  }

  const ref = parseAnnotationPathTarget(facet.Target)
  if (ref) {
    const value = store.get(entityType, ref.termKey, ref.qualifier)
    switch (ref.term) {
      case 'FieldGroup':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'form', fields: (value?.Data || []).map(r => buildColumn(store, entityType, r)) } }
      case 'DataPoint':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'dataPoint', dataPoint: value } }
      case 'Contact':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'contact', contact: value } }
      case 'Chart':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'chart', chart: value } } // partial, §3.2
      case 'Identification':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'identification', actions: value } }
      case 'Address':
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'address', address: value } }
      default:
        return { ...base, kind: 'ReferenceFacet', content: { kind: 'unknown', target: facet.Target } }
    }
  }

  return { ...base, kind: 'ReferenceFacet', content: { kind: 'unknown', target: facet.Target } }
}

/** Builds the `OPLayout` for one entity type/navigation (§3.2), from the `AnnotationStore` plus an
 *  optional FE manifest `ObjectPage` routing-target's `options.settings` (`pageSettings`, §3.2b).
 *  `model` (CSN) is only used to resolve sub-object-page navigation target types -- never for
 *  annotation data, which always comes from `store`. */
function buildObjectPage(model, store, entityType, { pageSettings } = {}) {
  const bag = store.raw(entityType)
  const headerInfo = bag['@UI.HeaderInfo'] || {}
  const facets = bag['@UI.Facets'] || []
  const headerFacets = bag['@UI.HeaderFacets'] || []
  const identification = bag['@UI.Identification']

  return {
    entityType,
    header: {
      typeName: headerInfo.TypeName,
      typeNamePlural: headerInfo.TypeNamePlural,
      title: headerInfo.Title,
      description: headerInfo.Description,
      typeImageUrl: headerInfo.TypeImageUrl,
      imageUrl: headerInfo.ImageUrl,
      initials: headerInfo.Initials
    },
    headerFacets: headerFacets.map(f => buildFacet(model, store, entityType, f)),
    headerActions: (identification || []).map(r => buildColumn(store, entityType, r)),
    sections: facets.map(f => buildFacet(model, store, entityType, f)),
    editableHeaderContent: pageSettings?.editableHeaderContent ?? feDefaults.objectPage.editableHeaderContent,
    sectionLayout: pageSettings?.sectionLayout || feDefaults.objectPage.sectionLayout
  }
}

module.exports = { buildObjectPage, buildFacet, parseAnnotationPathTarget, parseNavigationLineItemTarget }
