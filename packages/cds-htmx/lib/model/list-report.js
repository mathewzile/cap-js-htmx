const { buildField } = require('./fields')
const feDefaults = require('./fe-defaults')
const { typeFromUrl } = require('../annotations/vocab')
const { containerTarget, buildCapabilities } = require('./capabilities')
const { editCapabilities } = require('./edit-capabilities')
const { buildHierarchy } = require('./hierarchy')

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

/** CDS type -> the EDM type a filter control depends on. Only temporal types matter to the filter bar. */
const EDM_TYPES = { 'cds.Date': 'Edm.Date', 'cds.DateTime': 'Edm.DateTimeOffset', 'cds.Timestamp': 'Edm.DateTimeOffset' }

const enumName = value => String(value?.$EnumMember ?? value ?? '').split('/').pop()

/** What a filter field accepts: `Capabilities.FilterRestrictions/FilterExpressionRestrictions` (container member)
 *  or the property's `Common.FilterExpressionType`. `SingleValue`/`SingleRange` on a date field is what makes FE
 *  render a date (range) picker instead of the free-text condition field. */
function filterTraits(store, entityType, field, restrictions) {
  const entry = (restrictions?.FilterExpressionRestrictions || []).find(r => (r.Property?.$PropertyPath ?? r.Property) === field.path)
  const expression = enumName(entry?.AllowedExpressions ?? store.raw(`${entityType}/${field.path}`)['@Common.FilterExpressionType'])
  const edmType = EDM_TYPES[require('../annotations/edm').resolveElement(require('@sap/cds').model, entityType, field.path)?.type]
  return { ...field, edmType, filterExpression: expression || undefined }
}

/** `UI.SelectionFields` -> filter-bar fields, in annotation order, each resolved to its merged
 *  `FieldLayout` and excluding anything the property marks `@UI.HiddenFilter`. */
function buildFilterBar(store, entityType, selectionFields = [], restrictions) {
  return selectionFields
    .filter(path => !store.raw(`${entityType}/${path}`)['@UI.HiddenFilter'])
    .map(path => filterTraits(store, entityType, buildField(store, entityType, path), restrictions))
}

/** Properties a user may add through Adapt Filters ("Add Filter") beyond `UI.SelectionFields`: the entity's own
 *  scalar properties, minus technical/draft ones, `@UI.HiddenFilter` and what `Capabilities.FilterRestrictions`
 *  names as non-filterable. They are whitelisted for `f.<path>` like the rendered filter fields. */
const TECHNICAL = new Set(['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity', 'DraftAdministrativeData_DraftUUID', 'SiblingEntity', 'DraftAdministrativeData'])
function buildAvailableFilters(store, entityType, selected, restrictions) {
  const entity = require('../annotations/edm').entityDef(require('@sap/cds').model, entityType)
  const nonFilterable = new Set((restrictions?.NonFilterableProperties || []).map(p => p.$PropertyPath ?? p))
  const taken = new Set(selected)
  return Object.values(entity?.elements || {})
    .filter(el => !el.isAssociation && !el.virtual && el.type !== 'cds.Association' && el.type !== 'cds.Composition')
    .filter(el => !TECHNICAL.has(el.name) && !taken.has(el.name) && !nonFilterable.has(el.name))
    .filter(el => !store.raw(`${entityType}/${el.name}`)['@UI.HiddenFilter'])
    .map(el => filterTraits(store, entityType, buildField(store, entityType, el.name), restrictions))
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
  // `type: 'TreeTable'` needs the hierarchy the manifest names; without a usable one the table stays what FE would fall back to
  const hierarchy = tableSettings.type === 'TreeTable' ? buildHierarchy(store, entityType, tableSettings.hierarchyQualifier, tableSettings.initialExpansionLevel) : undefined
  const filterRestrictions = bag['@Capabilities.FilterRestrictions'] ?? store.raw(containerTarget(entityType))['@Capabilities.FilterRestrictions']

  return {
    entityType,
    header: {
      typeName: headerInfo.TypeName,
      typeNamePlural: headerInfo.TypeNamePlural
    },
    filterBar: {
      fields: buildFilterBar(store, entityType, bag['@UI.SelectionFields'], filterRestrictions),
      available: buildAvailableFilters(store, entityType, bag['@UI.SelectionFields'] || [], filterRestrictions),
      // FE shows the "Editing Status" filter for draft roots; it is not a model element, so it must
      // stay out of `fields` (those feed SELECT columns and the filter whitelist)
      editingStatus: !!store.raw(containerTarget(entityType))['@Common.DraftRoot']
    },
    table: {
      columns: lineItem.map(record => buildColumn(store, entityType, record)),
      type: hierarchy ? 'TreeTable' : tableSettings.type !== 'TreeTable' && tableSettings.type || feDefaults.listReport.table.type,
      hierarchy,
      selectionMode: tableSettings.selectionMode || feDefaults.listReport.table.selectionMode,
      // items per page: the presentation variant's MaxItems, else the manifest's growingThreshold, else FE's default
      growingThreshold: Number(presentationVariant?.MaxItems) || tableSettings.growingThreshold || feDefaults.listReport.table.growingThreshold,
      condensedTableLayout: tableSettings.condensedTableLayout ?? feDefaults.listReport.table.condensedTableLayout,
      sortOrder: presentationVariant?.SortOrder,
      groupBy: presentationVariant?.GroupBy
    },
    // a manifest with routing lists the navigations of the page; rows open a page only for the entity set's own entry
    navigable: pageSettings?.$navigation ? !!pageSettings.$navigation[entityType.split('.').pop()] : true,
    variantManagement: pageSettings?.variantManagement || feDefaults.listReport.variantManagement,
    initialLoad: pageSettings?.initialLoad ?? feDefaults.listReport.initialLoad,
    // The draft indicator ("Draft", "Locked", ...) sits under the semantic key column(s) only; without a
    // `Common.SemanticKey` FE shows none
    semanticKey: (bag['@Common.SemanticKey'] || []).map(k => typeof k === 'string' ? k : k.$PropertyPath ?? k.$Path).filter(Boolean),
    capabilities: buildCapabilities(store, entityType),
    edit: editCapabilities(store, entityType)
  }
}

module.exports = { buildListReport, buildColumn, buildFilterBar }
