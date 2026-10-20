const { buildField } = require('./fields')
const feDefaults = require('./fe-defaults')
const { typeFromUrl } = require('../annotations/vocab')

/** `CatalogService.Books` -> `CatalogService.EntityContainer/Books`, the container-member
 *  target `Capabilities.*Restrictions` annotations live under (§3.2: Capabilities row). */
function containerTarget(entityType) {
  const dot = entityType.lastIndexOf('.')
  return `${entityType.slice(0, dot)}.EntityContainer/${entityType.slice(dot + 1)}`
}

/** One `UI.LineItem` record -> a table column descriptor. Record shapes verified against a live
 *  compile (§3.2): every kind keeps its own fields rather than being flattened into one generic
 *  shape, since the renderer (Phase 3) needs to know which markup to produce. */
function buildColumn(store, entityType, record) {
  // compiled `@type` is sometimes a short alias (`UI.DataField`) and sometimes a full vocabulary
  // URL (`...#UI.ReferenceFacet`-shaped), depending on which annotation produced it; normalize.
  const kind = typeFromUrl(record['@type']) || 'UI.DataField'
  const common = {
    kind,
    label: record.Label,
    criticality: record.Criticality,
    criticalityRepresentation: record.CriticalityRepresentation,
    iconUrl: record.IconUrl,
    importance: record['@UI.Importance'],
    hidden: record['@UI.Hidden'],
    width: record['@HTML5.CssDefaults']?.width
  }

  switch (kind) {
    case 'UI.DataFieldWithNavigationPath':
      return { ...common, field: valueField(store, entityType, record, common.label), target: record.Target }
    case 'UI.DataFieldWithUrl':
      return { ...common, field: valueField(store, entityType, record, common.label), url: record.Url }
    case 'UI.DataFieldWithAction':
      return { ...common, field: valueField(store, entityType, record, common.label), action: record.Action }
    case 'UI.DataFieldForAction':
      return { ...common, action: record.Action, inline: !!record.Inline, determining: !!record.Determining }
    case 'UI.DataFieldForAnnotation':
      return { ...common, target: record.Target }
    case 'UI.DataFieldWithIntentBasedNavigation':
    case 'UI.DataFieldForIntentBasedNavigation':
      return { ...common, field: valueField(store, entityType, record, common.label), disabled: true } // no FLP (§3.2)
    default: // UI.DataField
      return { ...common, field: valueField(store, entityType, record, common.label) }
  }
}

/** Resolves a DataField-like record's `Value` into the merged property `FieldLayout`, when the
 *  value is a plain `$Path` (the common case). A computed/dynamic `Value` (rare) is kept as the
 *  raw expression under `.expr` instead -- there is no single property to look label/criticality
 *  semantics up for. */
function valueField(store, entityType, record, label) {
  const value = record.Value
  if (value && typeof value === 'object' && typeof value.$Path === 'string') {
    return buildField(store, entityType, value.$Path, { label })
  }
  return { expr: value, label }
}

/** `UI.SelectionFields` -> filter-bar fields, in annotation order, each resolved to its merged
 *  `FieldLayout` and excluding anything the property marks `@UI.HiddenFilter`. */
function buildFilterBar(store, entityType, selectionFields = []) {
  return selectionFields
    .filter(path => !store.raw(`${entityType}/${path}`)['@UI.HiddenFilter'])
    .map(path => buildField(store, entityType, path))
}

/** Restriction terms live on the container-member target (`Capabilities.*Restrictions`, §3.2).
 *  Absent in the sample today; still read generically so a future model gains support for free. */
function buildCapabilities(store, entityType) {
  const bag = store.raw(containerTarget(entityType))
  return {
    insert: bag['@Capabilities.InsertRestrictions'],
    update: bag['@Capabilities.UpdateRestrictions'],
    delete: bag['@Capabilities.DeleteRestrictions'],
    search: bag['@Capabilities.SearchRestrictions'],
    filter: bag['@Capabilities.FilterRestrictions'],
    sort: bag['@Capabilities.SortRestrictions'],
    count: bag['@Capabilities.CountRestrictions'],
    navigation: bag['@Capabilities.NavigationRestrictions']
  }
}

/** Builds the `LRLayout` for one entity type (§3.2), from the `AnnotationStore` plus an optional
 *  FE manifest `ListReport` routing-target's `options.settings` (`pageSettings`, §3.2b) -- never
 *  from raw CSN. Falls back to `fe-defaults.js` wherever the manifest is silent or absent. */
function buildListReport(store, entityType, { pageSettings } = {}) {
  const bag = store.raw(entityType)
  const headerInfo = bag['@UI.HeaderInfo'] || {}
  const lineItem = bag['@UI.LineItem'] || []
  const presentationVariant = bag['@UI.PresentationVariant'] || bag['@UI.SelectionPresentationVariant']?.PresentationVariant

  const tableSettings = pageSettings?.controlConfiguration?.['@com.sap.vocabularies.UI.v1.LineItem']?.tableSettings || {}

  return {
    entityType,
    header: {
      typeName: headerInfo.TypeName,
      typeNamePlural: headerInfo.TypeNamePlural
    },
    filterBar: {
      fields: buildFilterBar(store, entityType, bag['@UI.SelectionFields']),
      // FE shows the "Editing Status" filter for draft roots; it is not a model element, so it must
      // stay out of `fields` (those feed SELECT columns and the filter whitelist)
      editingStatus: !!store.raw(containerTarget(entityType))['@Common.DraftRoot']
    },
    table: {
      columns: lineItem.map(record => buildColumn(store, entityType, record)),
      type: tableSettings.type || feDefaults.listReport.table.type,
      selectionMode: tableSettings.selectionMode || feDefaults.listReport.table.selectionMode,
      growingThreshold: tableSettings.growingThreshold || feDefaults.listReport.table.growingThreshold,
      condensedTableLayout: tableSettings.condensedTableLayout ?? feDefaults.listReport.table.condensedTableLayout,
      sortOrder: presentationVariant?.SortOrder,
      groupBy: presentationVariant?.GroupBy
    },
    variantManagement: pageSettings?.variantManagement || feDefaults.listReport.variantManagement,
    initialLoad: pageSettings?.initialLoad ?? feDefaults.listReport.initialLoad,
    // The draft indicator ("Draft", "Locked", ...) sits under the semantic key column(s) only; without a
    // `Common.SemanticKey` FE shows none
    semanticKey: (bag['@Common.SemanticKey'] || []).map(k => typeof k === 'string' ? k : k.$PropertyPath ?? k.$Path).filter(Boolean),
    capabilities: buildCapabilities(store, entityType),
    edit: require('./edit-capabilities').editCapabilities(store, entityType)
  }
}

module.exports = { buildListReport, buildColumn, buildFilterBar, buildCapabilities, containerTarget }
