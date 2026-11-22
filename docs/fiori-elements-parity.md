# Fiori elements parity

What the plugin builds from the annotations, what it leaves out, and where its pages differ from a Fiori elements V4 app. Planned work is in [Open items and roadmap](OPEN_ITEMS_AND_ROADMAP.md).

- [Supported annotations](#supported-annotations): the terms the plugin reads, by vocabulary
- [Terms not (fully) supported](#terms-not-fully-supported): what Fiori elements documents and the plugin does not build
- [Known deviations](#known-deviations): behaviour that differs or is missing
- [How terms become pages](#how-terms-become-pages)

## Supported annotations

The plugin reads the merged annotations ([how they are merged](ARCHITECTURE.md#3-how-the-annotations-are-merged)) and builds every page from them. The terms below are the plugin's own registry (`lib/annotations/registry.js`); a running service reports it for its own model:

- `GET /htmx/<service>/$coverage` lists every annotation term found in the service with its status, and
- `GET /htmx/<service>/$annotations` returns the merged annotations, which match `/odata/v4/<service>/$metadata`.

A term the registry has no opinion about is reported as `unknown`: it is dropped and never rendered. The test suite asserts that the sample model has none.

| Status | Meaning |
|---|---|
| **supported** | read and rendered as Fiori elements V4 does |
| **partial** | read, with a part of its function missing (see the notes) |
| **ignored** | known and deliberately not rendered |

### UI

| Status | Terms |
|---|---|
| supported | `HeaderInfo`, `LineItem`, `SelectionFields`, `HiddenFilter`, `ExcludeFromNavigationContext`, `PresentationVariant`, `SelectionVariant`, `SelectionPresentationVariant`, `Facets`, `HeaderFacets`, `FieldGroup`, `Identification`, `ConnectedFields`, `DataPoint`, `Hidden`, `TextArrangement`, `MultiLineText`, `Placeholder`, `IsImageURL`, `CreateHidden`, `UpdateHidden`, `DeleteHidden`, `Criticality`, `CriticalityRepresentation`, `IconUrl`, `Importance`, `PartOfPreview`, `IsCopyAction`, `DoNotCheckScaleOfMeasureQuantity` |
| partial | `Chart`: an Object Page facet `<navigation>/@UI.Chart` is drawn as inline SVG from the navigation's rows (Column, Bar, their stacked forms, Line, Area, Pie, Donut; any other `ChartType` as columns). Not on the List Report, no micro charts, no drill-down, no `sap.viz` set |
| ignored | `Badge`, `Note`, `Recommendations`, `QuickViewFacets`, `QuickCreateFacets`, `KPI`, `Spreadsheet` |

`LineItem` records: `DataField`, `DataFieldWithUrl`, `DataFieldWithNavigationPath`, `DataFieldWithAction`, `DataFieldForAction` (toolbar, inline in the row, or determining in the footer) and `DataFieldForAnnotation`. Intent-based navigation (`DataFieldWithIntentBasedNavigation`) is rendered disabled.

### Common

| Status | Terms |
|---|---|
| supported | `Label`, `Heading`, `QuickInfo`, `Text`, `TextFor`, `SemanticKey`, `SemanticObject`, `SemanticObjectMapping`, `SemanticObjectUnavailableActions`, `FieldControl`, `ValueList`, `ValueListWithFixedValues`, `ValueListRelevantQualifiers`, `ValueListForValidation`, `SideEffects`, `Messages`, `IsActionCritical`, `DefaultValuesFunction`, `FilterDefaultValue`, `FilterExpressionRestrictions`, `DraftRoot`, `DraftNode`, `IsUpperCase`, `IsDigitSequence`, `IsCalendarDate`, `IsCalendarYear`, `IsCalendarMonth`, `Masked`, `Timezone` |
| partial | `SAPObjectNodeType` |
| ignored | `AddressViaNavigationPath` |

### Other vocabularies

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
| Hierarchy | supported | `RecursiveHierarchy`. `RecursiveHierarchyActions` is partial: `ChangeNextSiblingAction` (Move Up / Down, drop between nodes) and `ChangeSiblingForRootsSupported`; `CopyAction` is not built |
| Analytics, Session | ignored | the whole vocabularies (analytical list page, analytical tables, sticky sessions) |

## Terms not (fully) supported

Fiori elements publishes no machine-readable list of what it supports, so this is a snapshot (Nov 2026) built from the published vocabularies (SAP `UI`, `Common`, `Communication`, `Hierarchy`, `HTML5`, `PersonalData`, `Session`, `Analytics`; OASIS `Capabilities`, `Core`, `Measures`, `Validation`, `Aggregation`) and the SAPUI5 documentation for Fiori elements for OData V4. The column "FE V4 docs" is the number of documentation pages that name the term. It is a proxy for "Fiori elements supports it", since a page can name a term it explains is *not* supported. The status is the registry's: `partial`, `ignored` (known, not rendered), `missing` (the plugin has no opinion: the term is dropped) or, for a record type, `not in code`. It compares terms only. What a *record* of a supported term supports (properties such as `DataField.Criticality`, the `Chart.ChartType` values) and the manifest settings are covered under [Known deviations](#known-deviations).

| Vocabulary | Terms | Named in FE V4 docs | of those: supported | partial | ignored / missing | cds-htmx supported or partial (all terms) |
|---|---|---|---|---|---|---|
| UI | 61 | 43 | 25 | 1 | 17 | 27 |
| Common | 105 | 56 | 25 | 1 | 30 | 30 |
| Communication | 7 | 5 | 4 | 0 | 1 | 4 |
| Hierarchy | 4 | 2 | 1 | 1 | 0 | 2 |
| HTML5 | 3 | 3 | 1 | 0 | 2 | 1 |
| PersonalData | 7 | 2 | 0 | 0 | 2 | 0 |
| Session | 1 | 0 | 0 | 0 | 0 | 0 |
| Analytics | 10 | 2 | 0 | 0 | 2 | 0 |
| Capabilities | 40 | 9 | 7 | 0 | 2 | 10 |
| Core | 44 | 10 | 6 | 2 | 2 | 12 |
| Measures | 5 | 2 | 2 | 0 | 0 | 3 |
| Validation | 14 | 3 | 2 | 0 | 1 | 4 |
| Aggregation | 10 | 5 | 1 | 0 | 4 | 1 |

The terms that three or more documentation pages name and the plugin does not fully support:

| Vocabulary | Term | FE V4 docs (files) | cds-htmx |
|---|---|---|---|
| UI | `Chart` | 48 | partial |
| UI (record) | `ChartMeasureAttributeType` | 24 | not in code |
| UI (record) | `ChartDefinitionType` | 23 | not in code |
| UI (record) | `Facet` | 17 | not in code |
| UI (record) | `ChartDimensionAttributeType` | 11 | not in code |
| Common | `SortOrder` | 10 | missing |
| UI | `CriticalityCalculation` | 9 | missing |
| UI (record) | `CriticalityCalculationType` | 9 | not in code |
| UI (record) | `SelectionRangeType` | 8 | not in code |
| UI (record) | `SelectOptionType` | 8 | not in code |
| Aggregation | `ApplySupported` | 8 | ignored |
| PersonalData | `IsPotentiallySensitive` | 7 | missing |
| UI | `QuickViewFacets` | 3 | ignored |
| UI (record) | `Parameter` | 3 | not in code |
| Common | `IsNaturalPerson` | 3 | missing |
| Communication | `Message` | 3 | missing |
| Hierarchy | `RecursiveHierarchyActions` | 3 | partial |
| Analytics | `AggregatedProperty` | 3 | ignored |
| Analytics | `Measure` | 3 | ignored |
| Core | `AcceptableMediaTypes` | 3 | missing |
| Core | `MediaType` | 3 | partial |
| Validation | `MaxItems` | 3 | missing |
| Aggregation | `CustomAggregate` | 3 | ignored |

A further 60 terms are named by only one or two pages (46 and 14). They are not repeated here: `$coverage` of a running service gives the status of every term it uses.

## Known deviations

The goal is a List Report and Object Page that behave and look like the standard Fiori elements V4 app. These are the places where they do not.

### Not planned

- **Share menu and Related Apps** in the page header (send e-mail, save as tile, Microsoft Teams, related apps).
- **Analytical list page, analytical tables, sticky (non-draft) editing sessions.** Fiori elements can edit an entity without `@odata.draft.enabled` through a sticky session; here such an entity is shown and can be deleted, but has no Edit and no Create. The `Analytics`, `Aggregation` (analytical part) and `Session` vocabularies are ignored.
- **Annotations the plugin ignores:** `UI.Badge`, `UI.Note`, `UI.Recommendations`, `UI.QuickViewFacets`, `UI.QuickCreateFacets`, `UI.KPI`, `UI.Spreadsheet`. See [Supported annotations](#supported-annotations).

### By design

- **No UI code in an app, and no UI5 in the browser.** Controller extensions and XML fragments of Fiori elements do not run. The extension model is a declarative one (HTML fragments, building blocks, a server extension SPI), see the extensibility design.
- **Edit does not move the page.** In Fiori elements a form field is a few pixels taller in edit mode than in display mode, so the form shifts when Edit is pressed. Here a field, a table row of a section and the card keep one size in both modes (60px per field, 125px with a text area, 35px per row) and the draft indicator adds nothing to the height of the title; `edit-no-shift.spec.js` checks it.
- **Personalization is browser-local.** Saved views (variants) are kept in the browser, not on the server, and the UI5 flexibility features (key user adaptation) are not there.

### Not complete yet

- **Tree tables:** Create (below the selected node, or at the top level), Cut / Paste and drag and drop (onto a node: below it; onto the empty area: the top level) work as in Fiori elements, and so do the Expand / Collapse Entire Tree buttons and the row context menu (the toolbar's actions for the row, Expand / Collapse Entire Node, Open in New Tab). A tree inside an Object Page section (a composition that is a hierarchy, `app/manage-catalogs`) is read within the object, from its draft while it is edited, and its nodes are edited in place. Where the entity has `Hierarchy.RecursiveHierarchyActions` with a `ChangeNextSiblingAction` (`app/manage-categories`), Move Up / Move Down and dropping on the upper or lower edge of a node order it among its siblings by calling that action (`NextSibling`); `ChangeSiblingForRootsSupported: false` fixes the order of the top-level nodes. Not built: `CopyAction` (copying a node), the extension points (`isNodeMovable`, `isMoveToPositionAllowed`, ...), and creation modes with node types. Pasting a node below itself or one of its own nodes does nothing, as in FE. The behaviour was compared with the FE Manage Categories sample; the Object Page tree (Catalogs) was observed in FE too: Cut / Paste is one `PATCH` of the node's draft with `parent@odata.bind`, and deleting a node with nodes below it is one `DELETE` of that node, the nodes below it go with it (both the same here).
- **Intent-based navigation**: the context of the page (or the selected row) is passed as parameters (and, for a page below another one, again under its path, `Authors.books.ID`) and as an app state (`sap-xapp-state`, a SelectionVariant of the same values), and the target applies them (filter fields, the semantic key opens the Object Page), as FE does; a target that is given only an app state applies it too. `DataFieldWithIntentBasedNavigation` is a link (form and table cell), a `DataFieldForIntentBasedNavigation` of a LineItem is a toolbar button on the selected row, and a `Common.SemanticObject` property is a link whose popover lists the launchpad's targets (`getLinks`, minus `SemanticObjectUnavailableActions`; `SemanticObjectMapping` renames the passed property). In a launchpad an intent it has no target for (`isNavigationSupported`) is not offered: the button is hidden, the link is plain text. Outside a launchpad nothing is known, so the button stays and the click shows an error strip. Checked in both directions in the sandbox (an htmx button or book page opens the FE Books app filtered or on the book). The app state needs the launchpad's `AppState` service (it is not saved without one, the parameters still go).
- **Charts** exist for an Object Page facet `nav/@UI.Chart` only: Column, Bar (also stacked), Line, Area, Pie and Donut as inline SVG with tooltips and a legend. No chart on the List Report, no micro charts, no selection or drill-down, no `sap.viz` types (bubble, scatter, waterfall, combination, ...), which are drawn as columns.
- **Unsaved changes of another user** show as in FE: an icon with "Unsaved changes by <name>" in the List Report, the icon alone in the Object Page header of the saved version (with no switch to a draft that is not yours), and a popover on either ("Unsaved Changes", "This object has unsaved changes made by <name>.", "Last changed on <date>."). The name is the draft holder's `InProcessByUserDescription` when the compiler adds it (`draftUserDescription`) and something fills it, else the user id, as in FE. The holder is read from the draft table, since another user's draft cannot be read through the service. Checked with two users, in an integration test and in a browser test with two sessions (`draft-lock-users.spec.js`).
- **Responsive behavior** follows the UI5 device ranges for the Flexible Column Layout (phone: the deepest column, tablet: two, reached again with Close), the filter bar (one filter per row), toolbars and the anchor bar (they scroll), dialogs (full screen on a phone) and touch target sizes. Table columns are hidden by importance, not popped in under the row as UI5 does; there is no overflow menu for toolbar buttons; Object Page headers keep their desktop layout. It is checked in Edge at three widths, not on devices. See Open items.

### Visual differences still open

Compared screen by screen with the Fiori elements apps (`npm run test:visual`, images in `test-results/visual/`). The list report, the object page forms and the table sections, and the confirmation, Adapt Filters, saved views and draft marker popovers are aligned; what is left:

- **Adapt Filters** has no List / Group tabs and no Edit and Sort buttons.
- **Saved views:** Manage Views only deletes views (FE can also rename and set a default); the popover is not resizable.
- **Filter value help** selects several values like FE, with the tabs and OK. The Define Conditions tab closes it and opens the Define Conditions dialog of the field instead of switching inside the dialog; the empty rows under the table are ruled across the whole width where FE rules only the width of the table.
- **Date filters:** a date range filter is FE's dynamic date range (one input, the list of choices, the calendar). A filter for a single date and the date-time filters still use the browser's own date inputs. "Month" in the list is a month of the current year, and the calendar has no keyboard navigation of the days yet.
- **Export menu** has only "Export"; FE also offers "Export as...".
- **Date-times** are shown as ISO text; dates and numbers follow the request locale.
- **The two Manage Authors apps do not share annotations** (the FE one has no table title and its own date format, the htmx one has both), so some screens differ by what they are annotated with rather than by how they are drawn.
- **Column layout (Manage Authors):** the columns, the separator, the gutters, the header with its column buttons above the title, the narrow list report and the active row marker are aligned with FE in the two-column layout. Not yet compared: edit mode and the draft dialogs of the Authors pages, and the toggle buttons FE puts in the narrow list report's toolbar.

## How terms become pages

- A layout model is built **only** from the annotation store, the manifest and Fiori elements' defaults, never from ad-hoc reads of the CDS model. The CDS model is used for typing and queries.
- `@readonly` and the `Capabilities` restrictions decide what a page and a table section offer (Create, Edit, Delete, inline editing). The server refuses what the page does not offer.
- Page settings come from the app's manifest: `controlConfiguration` (also with qualified keys such as `awards/@UI.LineItem#Awards`), `contextPath`, `variantManagement`, `initialExpansionLevel`, `$navigation`, `fcl` and `sap.htmx.animations`.
