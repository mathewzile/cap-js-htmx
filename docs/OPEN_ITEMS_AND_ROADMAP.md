# Open items and roadmap

Work that is not part of the initial implementation, which is finished. Each entry says what is missing today, so it can be scheduled without re-reading the code.

## Open items (known gaps against Fiori elements)

### Tree tables

Tree tables read, create and move nodes (`Aggregation.RecursiveHierarchy`, expand/collapse, filters with their ancestors, `initialExpansionLevel`, paged children, Create below the selected node, Cut / Paste). Like FE, a tree lists the active nodes only (a draft child does not show until it is saved). Still missing:

- `Hierarchy.RecursiveHierarchyActions.CopyAction` (copy a node) is not built: CAP does not implement it and there is no FE sample to compare with.
- The extension points (`isNodeMovable`, `isMoveToPositionAllowed`, `isNodeCopyable`, ...) are functions of an FE app's own JavaScript; they wait for the frontend extensibility item of the roadmap.

### Intent-based navigation

Built: the source passes the page's (or the selected row's) properties as parameters (`Mapping`, `RequiredProperties`), the target applies startup parameters (a filter field filters; the **semantic key** opens the Object Page, the technical key alone only filters, as FE does), in the local launchpad sandbox between htmx and Fiori elements apps, in both directions (checked by clicking through: an htmx button or book page opens the FE Books app filtered by the author, or on the book). Also built: `sap-xapp-state` (written by the launchpad adapter, read at the target), the path-prefixed copies, `SemanticObjectMapping` / `SemanticObjectUnavailableActions` and `isNavigationSupported` (a button of an intent no tile serves, "Show Reviews" in the Authors sample, is hidden in both kinds of app). Outside a launchpad nothing can say whether a target exists, so the button stays and the click shows an error (covered by a test). Still missing:

- The link and cell forms are covered by unit tests and the scripted launchpad runs only; they are not compared with an FE sample.

### Out of scope

Fiori elements features that are not planned. They are listed as known deviations in the README.

- **Share / header action menu**: the share menu of the page header (send e-mail, save as tile, Microsoft Teams, ...).
- **Related apps**: the "Related Apps" action of the header.

## Roadmap (future work, not scheduled)

Each item needs the preceding phases done; Custom Pages also needs a design first.

- **Frontend extensibility** (design doc §6): fragment templates + sanitizer, building blocks, all FE V4 manifest extension points, `hx-fiori` controller-extension façade + ExtensionAPI, server extension SPI, coverage entries (custom pages are the next item). Includes personalization: saved view variants and the UI5 flexibility features (saved views are browser-local today), and the "Group" tab of Adapt Filters, since FE saves how the filter fields are grouped in the variant as well (needs an FE sample to follow). Re-verify the parity matrix against the UI5 SDK first.
- **Responsive support**: the pages adapt to the device (phone, tablet, desktop), following the SAP UI5 controls. Only controls that have responsive support in UI5 are covered; controls UI5 itself does not make responsive, for example `sap.ui.table.TreeTable` and the grid table, are ignored and keep their desktop rendering.
  - **Already there:** the Flexible Column Layout switches by the width of the layout (container query: below 600px one column, the deepest; below 960px at most two, the first one makes room), the filter bar stacks and toolbars scroll on a phone, dialogs are full screen on a phone, touch devices get 2.75rem targets, table columns drop by `UI.Importance` and width when the table is narrow (container queries, `columnBreakpoints()` in `render/table.js`; hidden, not popped in under the row as UI5 does), the form sections go to one column below 600px, and the page padding grows at 600px and 1440px.
  - **Still missing:** an overflow menu for toolbar buttons (they scroll sideways), the Object Page header and anchor bar on a narrow screen (they keep their desktop layout), pop-in of hidden table columns under the row, and a check on real phones and tablets (only Edge at three widths).
- **Custom Pages (non-standard FE floorplans)**: not started; needs a design and developer documentation first, then agreement, before any implementation. Scope to be defined in that design (what FE's flexible programming model calls custom pages / `sap.fe.core.fpm` targets, how they are registered, routed, composed from building blocks and extended).
- **Response compression (zstd)**: not started.
  - **Today:** only the static assets are compressed (`lib/assets.js` `compressedStatic`: brotli or gzip, made once and cached). The rendered HTML (pages, fragments, `$table` rows, CSV export) is sent as it is. A global compression middleware was avoided on purpose: it would buffer the SSE stream.
  - **The approuter:** it compresses text responses over 1 KB by itself (the npm `compression` module: gzip, deflate, br, no zstd). It leaves a response alone that is already encoded, that has `Cache-Control: no-transform` (the SSE stream has it) or whose client `Accept-Encoding` lacks gzip, so behind it nothing is compressed twice and SSE is safe.
  - **Intended approach:** handle it, narrowly, one layer per response. A shared `lib/compression.js` picks `zstd`, then `br`, then `gzip` from `Accept-Encoding` (zstd only where `zlib.zstdCompress` exists, Node 22.15 and later). `compressedStatic` uses it (zstd added, cached per file). A middleware around `res.send` compresses one-shot `text/html` and `text/csv` bodies of 1 KB or more, never SSE, `HEAD`, 204/304, an encoded or `no-transform` response, with async zlib, `Vary: Accept-Encoding` and a weak ETag. A setting `cds.htmx.compression` (on by default) turns it off. The approuter's own compression stays at its default.
  - **To check first:** whether the approuter passes the browser's `Accept-Encoding` on to the app (the local harness in `packages/cds-htmx/test/approuter` shows it). If it replaces it with gzip, zstd only helps direct access and the assets.
  - **Tests:** every encoding and each exclusion, the SSE stream not buffered (the first heartbeat arrives at once), and an end-to-end run behind the approuter.
- **SSE across multiple instances (Redis pub/sub)**: not started.
  - **Today:** the SSE connections and the side-effect events live in the memory of one process (`lib/sse/channels.js`, `lib/sse/side-effects-engine.js`, `lib/sse/stream.js`). With one instance every event reaches every connected client. With several deployed instances (scaled out on BTP / Cloud Foundry, Kubernetes) it breaks: an event raised by a request on instance A only reaches the clients connected to A, the clients on B and C never see it.
  - **Redis is only required with more than one instance.** A single instance (local development, tests, a one-instance deployment) needs no Redis and nothing to configure; the in-process delivery is complete there. Redis is needed only once the app runs as two or more instances.
  - **Design:** the side-effect events are published to a Redis pub/sub channel instead of being delivered straight to the local connections. Every instance subscribes, receives the same event, and broadcasts it to its own connected clients. The in-process delivery stays the default (no Redis configured, single instance), so local development and tests need nothing extra.
  - **To decide:** the event envelope on the channel (the same payload the stream writes, plus the origin instance so the publisher can skip or de-duplicate its own delivery), the channel naming per service / tenant so events do not cross tenants, reconnect and resubscribe when Redis drops (events in the gap are lost, pub/sub does not replay; clients refetch on reconnect), the `Last-Event-ID` handling when a client reconnects to a different instance, and the configuration (`cds.requires` entry, reusing the Redis service binding of the app where there is one).
  - **Tests:** two instances on one Redis, an event raised on one reaching a client on the other, no duplicate on the publishing instance, the fallback without Redis, and a Redis restart while clients are connected.
