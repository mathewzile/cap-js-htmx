# Open items and roadmap

Work that is not part of the initial implementation, which is finished. Each entry says what is missing today, so it can be scheduled without re-reading the code.

## Open items (known gaps against Fiori elements)

### Tree tables

Tree tables work for reading (`Aggregation.RecursiveHierarchy`, expand/collapse, filters with their ancestors, `initialExpansionLevel`, paged children). Still missing:

- **Create child / move node**: FE's tree table toolbar creates a node below the selected one and moves nodes (cut / paste, `Aggregation.RecursiveHierarchyActions`). Today a tree table is display-only.
- **Draft roots**: a tree whose entity is a draft root (nodes are edited as drafts) is not supported; the tree is read from the active data and only in display mode.

### Intent-based navigation: context and parameters

`DataFieldForIntentBasedNavigation` opens the target app through the launchpad's Navigation service (a button in the section's heading row, an error outside a launchpad). It passes nothing along and the target app opens on its own start page. Still missing, as in FE:

- **Source: pass the context.** The click reads the context of the open Object Page (the row the page shows, in a sub-object page the row of that page) and adds its properties to the navigation as parameters (`Navigation.navigate({ target: { semanticObject, action }, params })`, which the launchpad turns into the query of the target's URL). Which properties: those of the page's entity that have a value, with the record's `Mapping` (local property to the parameter name the target expects) applied and `RequiredProperties` forced in, and without `IsActiveEntity`, `HasActiveEntity`, `HasDraftEntity` and other draft or technical properties. The page script has the row from the rendered page (the button carries the values, or the properties are read from the server for the page's key, so a value the page does not show can be passed).
- **Target: apply the parameters.** The launchpad hands them to the component as startup parameters (`getComponentData().startupParameters`; `Component.js` only reads `route` today). The shell passes them to the first page request. The List Report applies them as filter values for the properties it has (a parameter that is a filter field fills it and runs the search), and ignores the ones it has not.
- **Target: open the Object Page when the keys are all there.** When the parameters hold a value for every key property of the root entity, apart from the draft key `IsActiveEntity`, the app opens that object's page directly (the active one), with the List Report beside it in the column layouts as a deep link does. A missing key leaves the List Report with the filters applied.
- **Tests:** the parameters built from a page (mapping, required properties, no draft keys), a launchpad run from an Authors book page to the Books app that lands on the book (all keys), and one with a partial key that lands on a filtered List Report.
- **Across the two kinds of app:** the same runs in the local launchpad sandbox from a Fiori elements app to its htmx counterpart (Manage Authors (FE) to Manage Books (htmx), and the other way round), so the context a page passes and the parameters a target applies work whichever of the two sits on either side. In both directions the target lands on the book (all keys) or on a filtered List Report (partial key), as it does between two apps of the same kind.

### Out of scope

Fiori elements features that are not planned. They are listed as known deviations in the README.

- **Share / header action menu**: the share menu of the page header (send e-mail, save as tile, Microsoft Teams, ...).
- **Related apps**: the "Related Apps" action of the header.

## Roadmap (future work, not scheduled)

Each item needs the preceding phases done; Custom Pages also needs a design first.

- **Frontend extensibility** (design doc §6): fragment templates + sanitizer, building blocks, all FE V4 manifest extension points, `hx-fiori` controller-extension façade + ExtensionAPI, server extension SPI, coverage entries (custom pages are the next item). Includes personalization: saved view variants and the UI5 flexibility features (saved views are browser-local today), and the "Group" tab of Adapt Filters, since FE saves how the filter fields are grouped in the variant as well (needs an FE sample to follow). Re-verify the parity matrix against the UI5 SDK first.
- **Responsive support**: the pages adapt to the device (phone, tablet, desktop), following the SAP UI5 controls. Only controls that have responsive support in UI5 are covered; controls UI5 itself does not make responsive, for example `sap.ui.table.TreeTable` and the grid table, are ignored and keep their desktop rendering.
  - **Already there:** table columns drop by `UI.Importance` and width when the table is narrow (container queries, `columnBreakpoints()` in `render/table.js`; they are hidden, not popped in under the row as UI5's pop-in does), the form sections go to one column below 600px, the page padding grows at 600px and 1440px, and dialogs are capped to the viewport width.
  - **Flexible Column Layout:** on a device without the width for the columns it shows one column at a time, as `sap.f.FlexibleColumnLayout` does (it switches by the width of the layout: below about 960px two columns do not fit, below about 600px one; the columns keep their order and the others are reached with the column's Close / back). Today the columns stay side by side and squeeze at any width.
  - **Missing elsewhere:** the filter bar and toolbar on a phone (collapsing, overflow menu), the Object Page header and anchor bar on a narrow screen, pop-in of hidden table columns under the row, dialogs full-screen on a phone, touch-sized targets, and tables in sections.
  - Needs a design first (breakpoints as the UI5 device ranges, container versus viewport queries, how a hidden FCL column is reached) and a check against the UI5 SDK for each control before it is taken up.
- **Custom Pages (non-standard FE floorplans)**: not started; needs a design and developer documentation first, then agreement, before any implementation. Scope to be defined in that design (what FE's flexible programming model calls custom pages / `sap.fe.core.fpm` targets, how they are registered, routed, composed from building blocks and extended).
- **Response compression (zstd)**: not started.
  - **Today:** only the static assets are compressed (`lib/assets.js` `compressedStatic`: brotli or gzip, made once and cached). The rendered HTML (pages, fragments, `$table` rows, CSV export) is sent as it is. A global compression middleware was avoided on purpose: it would buffer the SSE stream.
  - **The approuter:** it compresses text responses over 1 KB by itself (the npm `compression` module: gzip, deflate, br, no zstd). It leaves a response alone that is already encoded, that has `Cache-Control: no-transform` (the SSE stream has it) or whose client `Accept-Encoding` lacks gzip, so behind it nothing is compressed twice and SSE is safe.
  - **Intended approach:** handle it, narrowly, one layer per response. A shared `lib/compression.js` picks `zstd`, then `br`, then `gzip` from `Accept-Encoding` (zstd only where `zlib.zstdCompress` exists, Node 22.15 and later). `compressedStatic` uses it (zstd added, cached per file). A middleware around `res.send` compresses one-shot `text/html` and `text/csv` bodies of 1 KB or more, never SSE, `HEAD`, 204/304, an encoded or `no-transform` response, with async zlib, `Vary: Accept-Encoding` and a weak ETag. A setting `cds.htmx.compression` (on by default) turns it off. The approuter's own compression stays at its default.
  - **To check first:** whether the approuter passes the browser's `Accept-Encoding` on to the app (the local harness in `packages/cds-htmx/test/approuter` shows it). If it replaces it with gzip, zstd only helps direct access and the assets.
  - **Tests:** every encoding and each exclusion, the SSE stream not buffered (the first heartbeat arrives at once), and an end-to-end run behind the approuter.
- **SSE across multiple instances (Redis pub/sub)**: not started.
  - **Today:** the SSE connections and the side-effect events live in the memory of one process (`lib/sse/channels.js`, `lib/sse/side-effects-engine.js`, `lib/sse/stream.js`). With one instance every event reaches every connected client. With several deployed instances (scaled out on BTP / Cloud Foundry, Kubernetes) it breaks: an event raised by a request on instance A only reaches the clients connected to A, the clients on B and C never see it.
  - **Design:** the side-effect events are published to a Redis pub/sub channel instead of being delivered straight to the local connections. Every instance subscribes, receives the same event, and broadcasts it to its own connected clients. The in-process delivery stays the default (no Redis configured, single instance), so local development and tests need nothing extra.
  - **To decide:** the event envelope on the channel (the same payload the stream writes, plus the origin instance so the publisher can skip or de-duplicate its own delivery), the channel naming per service / tenant so events do not cross tenants, reconnect and resubscribe when Redis drops (events in the gap are lost, pub/sub does not replay; clients refetch on reconnect), the `Last-Event-ID` handling when a client reconnects to a different instance, and the configuration (`cds.requires` entry, reusing the Redis service binding of the app where there is one).
  - **Tests:** two instances on one Redis, an event raised on one reaching a client on the other, no duplicate on the publishing instance, the fallback without Redis, and a Redis restart while clients are connected.
