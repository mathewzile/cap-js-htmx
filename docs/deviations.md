# Known deviations from Fiori elements

The goal is a List Report and Object Page that behave and look like the standard Fiori elements V4 app. These are the places where they do not. Planned work is in [Open items and roadmap](OPEN_ITEMS_AND_ROADMAP.md).

## Not planned

- **Share menu and Related Apps** in the page header (send e-mail, save as tile, Microsoft Teams, related apps).
- **Analytical list page, analytical tables, sticky (non-draft) editing sessions.** Fiori elements can edit an entity without `@odata.draft.enabled` through a sticky session; here such an entity is shown and can be deleted, but has no Edit and no Create. The `Analytics`, `Aggregation` (analytical part) and `Session` vocabularies are ignored.
- **Annotations the plugin ignores:** `UI.Badge`, `UI.Note`, `UI.Recommendations`, `UI.QuickViewFacets`, `UI.QuickCreateFacets`, `UI.KPI`, `UI.Spreadsheet`. See [Supported annotations](annotations.md).

## By design

- **No UI code in an app, and no UI5 in the browser.** Controller extensions and XML fragments of Fiori elements do not run. The extension model is a declarative one (HTML fragments, building blocks, a server extension SPI), see the extensibility design.
- **A sub-object page has no Edit button of its own**, with or without columns. While the first page is edited the sub-object page is the draft; otherwise it shows the saved version. The Manage Books Fiori elements app shows an Edit button on a sub-object page in display mode that edits the root draft; this plugin leaves it out.
- **Personalization is browser-local.** Saved views (variants) are kept in the browser, not on the server, and the UI5 flexibility features (key user adaptation) are not there.

## Not complete yet

- **Tree tables are display-only:** no create child, no move node, and no draft roots. See Open items.
- **New drafts do not yet appear in the List Report** of their creator after leaving the app.
- **Intent-based navigation links** (`DataFieldWithIntentBasedNavigation`) are rendered disabled; `SemanticObject` links are disabled outside a launchpad.
- **Charts** are micro charts and a simple column or bar chart as inline SVG, not the full `sap.viz` set.
- **The "locked by" name** of another user's draft is not shown.
- **Responsive behavior** is partial. See Open items.
