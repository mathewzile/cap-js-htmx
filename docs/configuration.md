# Configuration

## Plugin: `cds.htmx`

Set in `package.json` (`"cds": { "htmx": { ... } }`), in `.cdsrc.json` or with environment variables (`CDS_HTMX_THEME=sap_horizon_dark`, structured values as JSON). The defaults are in `lib/config.js`.

| Option | Default | Meaning |
|---|---|---|
| `theme` | `sap_horizon` | `sap_horizon`, `sap_horizon_dark`, `sap_horizon_hcb`, `sap_horizon_hcw`, or `auto` (light or dark as the browser prefers, and it follows a change of the system setting). An unknown name falls back to `sap_horizon`. In SAP Work Zone the user's theme applies |
| `treeChildrenPage` | `100` | children of a tree node read per request; a `More` row loads the next page |
| `sse.heartbeat` | `15000` | milliseconds between heartbeats on the event stream |
| `liveListReport` | `true` | a List Report updates its rows from `SourceEvents` of the side effects |
| `requireHxRequestForMutations` | `true` | a write must come from htmx (`HX-Request`), a CSRF guard besides the token |
| `serverTiming` | `true` | every answer carries `Server-Timing: db;desc="<n> stmts";dur=…, app;dur=…` (browser dev tools, Network → Timing): the database statements and the time spent in the service, to tell them from the approuter and the network. `false` turns it off |
| `stickySessions` | `true` | session cookie so the event stream and the requests reach the same instance: `true` uses `JSESSIONID`, a string names the cookie, `false` turns it off |

### `cds.htmx.apps`

How the backend finds an app's manifest and annotations when a request carries `X-Htmx-App: <id>@<version>`.

| Option | Default | Meaning |
|---|---|---|
| `sources` | `[{ "kind": "local" }]` | tried in order. `local`: the `webapp/manifest.json` files under `app/` (or `root`). `destination`: reads the app's files over HTTP from where the frontend is deployed, through a BTP destination (`destination`) or a plain `url`; `path` defaults to `/{appId}/` |
| `allow` | `["*"]` | the app ids that may be served; the header is validated before it is used |
| `ttl` | `60000` | how long a remote app stays cached |
| `refetchInterval` | `5000` | the shortest time between two refetches of a remote app that the browser reports in another version |
| `localRecheck` | `1000` | how often a local app is checked for edits (the newest modification time below its folder) |
| `maxApps` | `50` | apps kept in the registry |
| `maxBundleBytes` | `2097152` | the largest bundle of an app |
| `fetchTimeout` | `5000` | timeout of a remote read, in milliseconds |

## App: `manifest.json`

An app is a folder `app/<name>/webapp` with a Fiori elements V4 style `manifest.json`, an optional `annotation.xml` and `i18n`. It holds no UI code.

```json
"sap.htmx": {
  "service": "/htmx/admin",
  "entry": "/htmx/admin/Authors",
  "animations": "fast"
}
```

| Setting | Meaning |
|---|---|
| `sap.htmx.service` | the service path the app talks to |
| `sap.htmx.entry` | the first route, loaded into the page |
| `sap.htmx.animations` | `full` (default), `fast` (every duration a quarter as long) or `none`. `true` and `false` still work as `full` and `none`. In a launchpad the calmer of this value and UI5's animation mode wins |
| `sap.htmx.fragments` | declared HTML fragments of the app |
| `sap.app.dataSources` | `ODataAnnotation` entries with a `localUri` are the annotation layers of the app, in this order, on top of the service's |
| `sap.ui5.routing` | which pages a row can open (`$navigation`), the page targets, and the flexible column layout (`sap.f.routing.Router`, `flexibleColumnLayout`, `defaultTwoColumnLayoutType`, `defaultThreeColumnLayoutType`) |
| `controlConfiguration` of a page target (`sap.ui5.routing.targets.<page>.options.settings`) | `tableSettings` of a line item such as `type` (`TreeTable`), `hierarchyQualifier`, `initialExpansionLevel`, `growingThreshold`; also `variantManagement` and `contextPath` |

## Shell

`packages/cds-htmx-shell` holds the few files that start in the browser. The build copies them into an app's `shell/` folder; in development the plugin serves them under the same URL. Everything else the shell needs (theme, scripts, texts, animation setting, service path) comes from one request, `GET /htmx/<service>/$shell`.
