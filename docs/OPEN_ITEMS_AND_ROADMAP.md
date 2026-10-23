# Open items and roadmap

Work that is **not** part of `IMPLEMENTATION_PLAN.md`'s phases. It is taken up after the initial implementation (phases 0 to 11 of the plan) is finished. Each entry says what is missing today, so it can be scheduled without re-reading the code.

## Open items (known gaps against Fiori elements)

### Tree tables

Tree tables work for reading (`Aggregation.RecursiveHierarchy`, expand/collapse, filters with their ancestors, `initialExpansionLevel`, paged children; see Phase 8 round 5 and Phase 10 of the plan). Still missing:

- **Create child / move node**: FE's tree table toolbar creates a node below the selected one and moves nodes (cut / paste, `Aggregation.RecursiveHierarchyActions`). Today a tree table is display-only.
- **Draft roots**: a tree whose entity is a draft root (nodes are edited as drafts) is not supported; the tree is read from the active data and only in display mode.

### New drafts missing from the List Report

A draft created with **New** does not show up in the List Report of the current user. After leaving the app and coming back there is no row to open the draft again, so it cannot be continued. The same holds after saving a newly created draft: the list does not show the new active entry. In FE the list contains the user's own drafts (draft indicator, "Own Draft") together with the active entries, and it refreshes by itself when a draft is created, saved or discarded. Wanted:

- a newly created draft appears in the List Report for the user who created it (own drafts only, as in FE), so it can be opened again after exiting and re-entering the app;
- saving a new draft replaces the draft row with the active entry, discarding it removes the row, without a manual reload;
- the list updates as required, whenever a draft action changes what it contains (create, save, discard, and edit of an active entry that turns it into a draft).

### Out of scope

Fiori elements features that are not planned. They are listed as known deviations in the README.

- **Share / header action menu**: the share menu of the page header (send e-mail, save as tile, Microsoft Teams, ...).
- **Related apps**: the "Related Apps" action of the header.

## Roadmap (future work, not scheduled)

Each item needs the preceding phases done; Custom Pages also needs a design first.

- **Frontend extensibility** (design doc §6): fragment templates + sanitizer, building blocks, all FE V4 manifest extension points, `hx-fiori` controller-extension façade + ExtensionAPI, server extension SPI, coverage entries (custom pages are the next item). Includes personalization: saved view variants and the UI5 flexibility features (saved views are browser-local today), and the "Group" tab of Adapt Filters, since FE saves how the filter fields are grouped in the variant as well (needs an FE sample to follow). Re-verify the parity matrix against the UI5 SDK first.
- **Responsive support**: the pages adapt to the device (phone, tablet, desktop), following the SAP UI5 controls. Only controls that have responsive support in UI5 are covered, for example the `sap.m` family: `sap.m.Table` with its pop-in columns (`demandPopin`, `minScreenWidth`, `importance`), the responsive filter bar and toolbar overflow, the responsive object page header and layout, and flexible column layout behavior per screen size. Controls that UI5 itself does not make responsive, for example `sap.ui.table.TreeTable` and `sap.ui.table.Table` (grid table), are ignored: they keep their desktop rendering. Needs a design first (breakpoints as the UI5 device ranges, how the server learns the device, which annotations such as `UI.Importance` drive column pop-in) and a check against the UI5 SDK for each control before it is taken up.
- **Custom Pages (non-standard FE floorplans)**: not started; needs a design and developer documentation first, then agreement, before any implementation. Scope to be defined in that design (what FE's flexible programming model calls custom pages / `sap.fe.core.fpm` targets, how they are registered, routed, composed from building blocks and extended).
