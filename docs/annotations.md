# Supported annotations

The plugin reads the merged annotations ([how they are merged](ARCHITECTURE.md#3-how-the-annotations-are-merged)) and builds every page from them. This page lists the terms it knows. The list is the plugin's own registry (`lib/annotations/registry.js`), and a running service reports it for its own model:

- `GET /htmx/<service>/$coverage` lists every annotation term found in the service with its status, and
- `GET /htmx/<service>/$annotations` returns the merged annotations, which match `/odata/v4/<service>/$metadata`.

A term the registry has no opinion about is reported as `unknown`: it is dropped and never rendered. The test suite asserts that the sample model has none.

| Status | Meaning |
|---|---|
| **supported** | read and rendered as Fiori elements V4 does |
| **partial** | read, with a part of its function missing (see the notes) |
| **ignored** | known and deliberately not rendered |

## UI

| Status | Terms |
|---|---|
| supported | `HeaderInfo`, `LineItem`, `SelectionFields`, `HiddenFilter`, `ExcludeFromNavigationContext`, `PresentationVariant`, `SelectionVariant`, `SelectionPresentationVariant`, `Facets`, `HeaderFacets`, `FieldGroup`, `Identification`, `ConnectedFields`, `DataPoint`, `Hidden`, `TextArrangement`, `MultiLineText`, `Placeholder`, `IsImageURL`, `CreateHidden`, `UpdateHidden`, `DeleteHidden`, `Criticality`, `CriticalityRepresentation`, `IconUrl`, `Importance`, `PartOfPreview`, `IsCopyAction`, `DoNotCheckScaleOfMeasureQuantity` |
| partial | `Chart` (micro charts as inline SVG; a chart in an Object Page section is a simple column or bar chart) |
| ignored | `Badge`, `Note`, `Recommendations`, `QuickViewFacets`, `QuickCreateFacets`, `KPI`, `Spreadsheet` |

`LineItem` records: `DataField`, `DataFieldWithUrl`, `DataFieldWithNavigationPath`, `DataFieldWithAction`, `DataFieldForAction` (toolbar, inline in the row, or determining in the footer) and `DataFieldForAnnotation`. Intent-based navigation (`DataFieldWithIntentBasedNavigation`) is rendered disabled.

## Common

| Status | Terms |
|---|---|
| supported | `Label`, `Heading`, `QuickInfo`, `Text`, `TextFor`, `SemanticKey`, `FieldControl`, `ValueList`, `ValueListWithFixedValues`, `ValueListRelevantQualifiers`, `ValueListForValidation`, `SideEffects`, `Messages`, `IsActionCritical`, `DefaultValuesFunction`, `FilterDefaultValue`, `FilterExpressionRestrictions`, `DraftRoot`, `DraftNode`, `IsUpperCase`, `IsDigitSequence`, `IsCalendarDate`, `IsCalendarYear`, `IsCalendarMonth`, `Masked`, `Timezone` |
| partial | `SemanticObject` (the link is disabled, there is no launchpad navigation), `SAPObjectNodeType` |
| ignored | `AddressViaNavigationPath` |

## Other vocabularies

| Vocabulary | Status | Terms |
|---|---|---|
| Communication | supported | `Contact`, `Address`, `IsEmailAddress`, `IsPhoneNumber` |
| Capabilities | supported | `InsertRestrictions`, `UpdateRestrictions`, `DeleteRestrictions`, `NavigationRestrictions`, `SearchRestrictions`, `FilterRestrictions`, `SortRestrictions`, `CountRestrictions`, `TopSupported`, `SkipSupported` |
| Core | supported | `Computed`, `ComputedDefaultValue`, `Immutable`, `OperationAvailable`, `Description`, `LongDescription`, `IsURL` |
| Core | partial | `Permissions`, `MediaType`, `IsMediaType`, `OptimisticConcurrency`, `Links` |
| Measures | supported | `ISOCurrency`, `Unit`, `Scale` |
| Validation | supported | `Minimum`, `Maximum`, `AllowedValues`, `Pattern` |
| HTML5 | supported | `CssDefaults` (column width) |
| Aggregation | supported | `RecursiveHierarchy` (tree table). The analytical terms are ignored |
| Hierarchy | supported | `RecursiveHierarchy` |
| Analytics, Session | ignored | the whole vocabularies (analytical list page, analytical tables, sticky sessions) |

## How terms become pages

- A layout model is built **only** from the annotation store, the manifest and Fiori elements' defaults, never from ad-hoc reads of the CDS model. The CDS model is used for typing and queries.
- `@readonly` and the `Capabilities` restrictions decide what a page and a table section offer (Create, Edit, Delete, inline editing). The server refuses what the page does not offer.
- Page settings come from the app's manifest: `controlConfiguration` (also with qualified keys such as `awards/@UI.LineItem#Awards`), `contextPath`, `variantManagement`, `initialExpansionLevel`, `$navigation`, `fcl` and `sap.htmx.animations`.
