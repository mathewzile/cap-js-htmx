# Known deviations from Fiori elements

The goal is a List Report and Object Page that behave and look like the standard Fiori elements V4 app. These are the places where they do not. Planned work is in [Open items and roadmap](OPEN_ITEMS_AND_ROADMAP.md).

## Not planned

- **Share menu and Related Apps** in the page header (send e-mail, save as tile, Microsoft Teams, related apps).
- **Analytical list page, analytical tables, sticky (non-draft) editing sessions.** Fiori elements can edit an entity without `@odata.draft.enabled` through a sticky session; here such an entity is shown and can be deleted, but has no Edit and no Create. The `Analytics`, `Aggregation` (analytical part) and `Session` vocabularies are ignored.
- **Annotations the plugin ignores:** `UI.Badge`, `UI.Note`, `UI.Recommendations`, `UI.QuickViewFacets`, `UI.QuickCreateFacets`, `UI.KPI`, `UI.Spreadsheet`. See [Supported annotations](annotations.md).

## By design

- **No UI code in an app, and no UI5 in the browser.** Controller extensions and XML fragments of Fiori elements do not run. The extension model is a declarative one (HTML fragments, building blocks, a server extension SPI), see the extensibility design.
- **Personalization is browser-local.** Saved views (variants) are kept in the browser, not on the server, and the UI5 flexibility features (key user adaptation) are not there.

## Not complete yet

- **Tree tables are display-only:** no create child, no move node, and no draft roots. See Open items.
- **New drafts do not yet appear in the List Report** of their creator after leaving the app.
- **Intent-based navigation**: only `DataFieldForIntentBasedNavigation` in an Object Page form navigates (no parameters, and not in a launchpad it shows an error); `DataFieldWithIntentBasedNavigation` is not a link yet; `SemanticObject` links are disabled outside a launchpad.
- **Charts** are micro charts and a simple column or bar chart as inline SVG, not the full `sap.viz` set.
- **The "locked by" name** of another user's draft is not shown.
- **Responsive behavior** is partial. See Open items.

## Visual differences still open

Compared screen by screen with the Fiori elements apps (`npm run test:visual`, images in `test-results/visual/`). The list report, the object page forms and the table sections, and the confirmation, Adapt Filters, saved views and draft marker popovers are aligned; what is left:

- **Adapt Filters** has no List / Group tabs and no Edit and Sort buttons.
- **Saved views:** Manage Views only deletes views (FE can also rename and set a default); the popover is not resizable.
- **Filter value help** selects several values like FE, with the tabs and OK. The Define Conditions tab closes it and opens the Define Conditions dialog of the field instead of switching inside the dialog; the empty rows under the table are ruled across the whole width where FE rules only the width of the table.
- **Date filters:** a date range filter is FE's dynamic date range (one input, the list of choices, the calendar). A filter for a single date and the date-time filters still use the browser's own date inputs. "Month" in the list is a month of the current year, and the calendar has no keyboard navigation of the days yet.
- **Export menu** has only "Export"; FE also offers "Export as...".
- **Date-times** are shown as ISO text; dates and numbers follow the request locale.
- **The two Manage Authors apps do not share annotations** (the FE one has no table title and its own date format, the htmx one has both), so some screens differ by what they are annotated with rather than by how they are drawn.
- **Column layout (Manage Authors):** the columns, the separator, the gutters, the header with its column buttons above the title, the narrow list report and the active row marker are aligned with FE in the two-column layout. Not yet compared: edit mode and the draft dialogs of the Authors pages, and the toggle buttons FE puts in the narrow list report's toolbar.
