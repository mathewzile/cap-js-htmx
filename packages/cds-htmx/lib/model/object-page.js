const { buildColumn } = require('./list-report')
const { buildCapabilities } = require('./capabilities')
const { editCapabilities } = require('./edit-capabilities')
const feDefaults = require('./fe-defaults')
const { typeFromUrl } = require('../annotations/vocab')
const { resolveElement } = require('../annotations/edm')
const { buildHierarchy } = require('./hierarchy')

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
  return parseNavigationLineItem(target)?.nav
}

/** The same with the qualifier of the line item (`awards/@UI.LineItem#Awards` -> `{ nav: 'awards', qualifier: 'Awards' }`), the
 *  vocabulary written out (`@com.sap.vocabularies.UI.v1.LineItem`) or as the alias. */
function parseNavigationLineItem(target) {
  const m = typeof target === 'string' && /^(.+)\/@(?:UI|com\.sap\.vocabularies\.UI\.v1)\.LineItem(?:#(.+))?$/.exec(target)
  return m ? { nav: m[1], qualifier: m[2] } : undefined
}

/** What a table section may do with its rows, from the annotations FE reads: the target entity's own restrictions (`@readonly`,
 *  `Capabilities.Insert/Update/DeleteRestrictions`) and the parent's `Capabilities.NavigationRestrictions` for this navigation. A
 *  restriction that is a per-row expression is not one that switches the table off. */
function sectionCapabilities(store, parentType, nav, targetType) {
  const own = targetType ? editCapabilities(store, targetType) : {}
  const entry = (buildCapabilities(store, parentType).navigation?.RestrictedProperties || [])
    .find(r => (r.NavigationProperty?.$NavigationPropertyPath ?? r.NavigationProperty) === nav)
  const allowed = (value, restriction) => value !== false && restriction !== false
  return {
    insertable: allowed(own.insertable, entry?.InsertRestrictions?.Insertable),
    updatable: allowed(own.updatable, entry?.UpdateRestrictions?.Updatable),
    deletable: allowed(own.deletable, entry?.DeleteRestrictions?.Deletable)
  }
}

/** One `Facets`/`HeaderFacets` entry -> a section/subsection content descriptor (§3.2: Facets row).
 *  `model` is CSN, used only to resolve a navigation facet's target entity type (structural typing,
 *  not annotation data -- the layout model itself still comes only from the store). */
function buildFacet(model, store, entityType, facet, pageSettings) {
  const kind = typeFromUrl(facet['@type']) || 'UI.ReferenceFacet'
  const base = {
    id: facet.ID,
    label: facet.Label,
    importance: facet['@UI.Importance'],
    hidden: facet['@UI.Hidden'],
    partOfPreview: facet['@UI.PartOfPreview'] !== false
  }

  if (kind === 'UI.CollectionFacet') {
    return { ...base, kind: 'CollectionFacet', facets: (facet.Facets || []).map(f => buildFacet(model, store, entityType, f, pageSettings)) }
  }

  const { nav, qualifier } = parseNavigationLineItem(facet.Target) || {}
  if (nav) {
    const element = resolveElement(model, entityType, nav)
    const targetEntityType = element?.target
    const columns = targetEntityType
      ? (store.get(targetEntityType, 'UI.LineItem', qualifier) || []).map(r => buildColumn(store, targetEntityType, r))
      : []
    // a section table is a tree when the manifest says so for this navigation's line item (`<nav>/@com.sap.vocabularies.UI.v1.LineItem[#qualifier]`)
    const tableSettings = pageSettings?.controlConfiguration?.[`${nav}/@com.sap.vocabularies.UI.v1.LineItem${qualifier ? `#${qualifier}` : ''}`]?.tableSettings || {}
    const hierarchy = targetEntityType && tableSettings.type === 'TreeTable' ? buildHierarchy(store, targetEntityType, tableSettings.hierarchyQualifier, tableSettings.initialExpansionLevel) : undefined
    // with routing in the manifest the page only opens a sub-object page for a navigation the manifest has a route for
    const navigable = pageSettings?.$navigation ? !!pageSettings.$navigation[nav] : true
    // the table pages like a List Report table: MaxItems of the target's presentation variant, else the manifest, else FE's default
    const targetBag = targetEntityType ? store.raw(targetEntityType) : {}
    const presentationVariant = targetBag['@UI.PresentationVariant'] || targetBag['@UI.SelectionPresentationVariant']?.PresentationVariant
    const growingThreshold = Number(presentationVariant?.MaxItems) || tableSettings.growingThreshold || feDefaults.objectPage.table.growingThreshold
    return { ...base, kind: 'ReferenceFacet', content: { kind: 'table', nav, targetEntityType, columns, composition: element?.type === 'cds.Composition', hierarchy, navigable, growingThreshold, sortOrder: presentationVariant?.SortOrder, capabilities: sectionCapabilities(store, entityType, nav, targetEntityType) } }
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
    headerFacets: headerFacets.map(f => buildFacet(model, store, entityType, f, pageSettings)),
    headerActions: (identification || []).map(r => buildColumn(store, entityType, r)),
    sections: facets.map(f => buildFacet(model, store, entityType, f, pageSettings)),
    editableHeaderContent: pageSettings?.editableHeaderContent ?? feDefaults.objectPage.editableHeaderContent,
    sectionLayout: pageSettings?.sectionLayout || feDefaults.objectPage.sectionLayout,
    edit: editCapabilities(store, entityType)
  }
}

module.exports = { sectionCapabilities, buildObjectPage, buildFacet, parseAnnotationPathTarget, parseNavigationLineItemTarget, parseNavigationLineItem }
