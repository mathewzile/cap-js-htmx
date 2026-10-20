# Frontend deployment, Work Zone integration and extensibility for `cds-htmx`

Companion to `IMPLEMENTATION_PLAN.md`. It adds Phases 7, 9 and 10. Phase 8 is FE feature parity (see `IMPLEMENTATION_PLAN.md` §8): the shell/Work Zone and extensibility work comes after the htmx app behaves like standard Fiori elements, and the old end-to-end/visual-parity phase is now Phase 11. Phase 7 is implemented; 9 and 10 are not.

## 0. Decisions

| # | Decision |
|---|---|
| D9 | **Pull at runtime.** The backend fetches an app's declarative bundle (manifest, annotation XML, HTML fragments, i18n) from where the frontend is deployed and caches it per version. |
| D10 | **UI5 wrapper component** hosts the htmx shell in-place in the Fiori launchpad (SAP Build Work Zone). A plain `index.html` (URL app / standalone) is the fallback. |
| D11 | **The FE V4 `manifest.json` is the app descriptor**, plus a small `sap.htmx` block. Extension keys are the same as in FE V4, so the UI5 SDK docs map 1:1. |

## 1. Target architecture

```
Browser / Work Zone (FLP)
 └─ HTML5 app "managebooks.htmx" (HTML5 repo, managed approuter, xs-app.json)
     ├─ Component.js  (UI5 wrapper → boots the htmx shell in-place)   | index.html (standalone / URL app)
     ├─ manifest.json (FE V4 manifest + "sap.htmx")  annotations/*.xml  i18n/  ext/fragment/*.html  ext/controller/*.js
     └─ requests  /htmx/** ──xs-app route──► destination "cap-htmx-srv" ──► CAP + cds-htmx (renders fragments)
                                                                              │
                         AppSource "pull" (destination / html5-repo / local) ◄┘ fetches manifest + declarative files, cached by version
```

- **Backend** stays the rendering engine. In *shell mode* it renders fragments only. Requests without app headers behave exactly as today.
- **Frontend project** holds the generic shell runtime (`packages/cds-htmx-shell`), its FE-style manifest, its local annotations and its extensions.
- **One generic shell, many apps.** The app is chosen from the component's own manifest, or from the startup parameter `sap-htmx-app`. One deployed shell can serve several tiles, each with its own set of endpoints and annotations.

### Answers to the original questions
| Question | Answer |
|---|---|
| Single app that dynamically loads UI from predefined endpoints? | Yes: generic shell + per-app manifest (§1, §5). |
| Reuse Work Zone `xs-app.json` routing via destination? | Yes. Same mechanism as FE `/odata/` routes; add a `/htmx/` route to the same destination (§4). |
| Can it be integrated into Work Zone? | Yes, in-place via a UI5 wrapper component (intents, inner-app hash, theme/language sync); URL app as fallback (§5). |
| Where do local annotations live? | In the frontend project (`webapp/annotations/*.xml`), declared in its manifest. The backend pulls them (§3). |
| Dynamic app → annotations by app? | Yes: store layering is per app (`X-Htmx-App`) (§2). |
| Frontend extensibility / FE parity? | §6. |

## 2. App identity and app-scoped rendering (backend)

- Shell root carries `hx-headers:inherited='{"X-Htmx-App":"<sap.app.id>@<version>","X-Htmx-Base":"<base>","Accept-Language":"<lang>"}'`. The SSE URL adds `&app=<id>`, and the channel remembers the app so pushed renders use the same layout (small Phase 6 addition in `lib/sse/channels.js`).
- `X-Htmx-App` is **untrusted**: validate against `^[A-Za-z0-9._-]+@[0-9A-Za-z.+-]+$` and `cds.htmx.apps.allow`; never use it as a filesystem path.
- **Store layering per app**: service `$metadata` annotations (`annotations/source.js annotationsOf`) → the app's `ODataAnnotation` layers in manifest order → page settings from that manifest only.
  - `model/cache.js`: cache keys become `${service}:${app@version}:${locale}`.
  - `annotations/store.js build`: take a list of annotation layers (XML strings) instead of an `appRoot`. `xml.js` already parses strings.
  - `annotations/manifest.js`: extract `settingsOf(manifest)` from `scanService`.
  - No `X-Htmx-App` header → today's merged `app/` scan; existing tests stay valid.
- **URL base.** Under Work Zone the approuter serves the app under `/<sap.cloud.service>.<appId>-<version>/…`. In shell mode `basePath = X-Htmx-Base + req.baseUrl` (validated with `^/[\w.\-/~]*$`). Renderers already take `basePath` (`table.js rowHref`, `filter-bar.js`, `layout.page`); `layout.headAssets` must take a base as well.
- **Version skew.** The provider's manifest version is authoritative. Header version older than cache: render with the cached bundle and send `HX-Trigger: hf:appUpdated` (shell shows a "new version, reload" strip). Header version newer than cache: re-fetch, at most once per `ttl`.

## 3. AppSource providers (the pull concept)

New `packages/cds-htmx/lib/apps/`:

- `sources.js`: provider SPI `{ kind, resolve(appId) → { manifest, version, readFile(relPath) } }`, configured in order by `cds.htmx.apps.sources`; first hit wins.
- `bundle.js`: builds the bundle from the manifest's own file list (annotation `localUri`s, i18n `bundleUrl`, `sap.htmx.fragments`, extension `template` names), so no directory listing is needed.
  - Limits: 2 MB per bundle, fetch timeout, extension allowlist `.json .xml .properties .html`.
  - **No server-side JS is loaded from a bundle.**
  - LRU per `appId@version` with negative caching; failure renders a 503 message fragment.
- Providers:
  - `local`: `manifest.js findManifests` over `app/`; dev default; mtime check invalidates.
  - `destination`: SAP Cloud SDK `executeHttpRequest`, destination e.g. `htmx-apps`, path template `/{appId}/`; optional dependency, lazy-required.
  - `html5-repo`: bound `html5-apps-repo` app-runtime instance, client credentials. **Spike in Phase 7: confirm the runtime content URL format.** Until then `destination` is the documented production default.
- Backend-team code (CAP handlers, the plugin SPI in §6C) is co-deployed with srv, never pulled.

## 4. Deployment on BTP (Cloud Foundry, MTA)

- Start from CAP's `cds add mta` / `html5-repo` / `workzone`: srv module, HTML5 deployer with zipped apps, destination content `cap-htmx-srv` (`HTML5.ForwardAuthToken: true`), xsuaa.
- Per-app `xs-app.json`:
  ```json
  { "welcomeFile": "/index.html", "authenticationMethod": "route", "routes": [
    { "source": "^/htmx/(.*)$", "target": "/htmx/$1", "destination": "cap-htmx-srv", "authenticationType": "xsuaa" },
    { "source": "^/odata/(.*)$", "target": "/odata/$1", "destination": "cap-htmx-srv", "authenticationType": "xsuaa" },
    { "source": "^(.*)$", "target": "$1", "service": "html5-apps-repo-rt", "authenticationType": "xsuaa" } ] }
  ```
- **CSRF**: approuter `csrfProtection` stays on; the shell extension `hx-csrf` fetches the token once (`X-CSRF-Token: Fetch`), adds it to non-GET requests and refetches once on a 403 `Required`. `requireHxRequestForMutations` stays.
- **Assets** stay on the backend at a versioned path `/htmx/-/v<pluginVersion>/…` (immutable cache), so renderer and assets never drift.
- **SSE** (approuter → gorouter → CAP): keep the 15 s heartbeat, raise the destination `timeout`, rely on hx-sse reconnect. Channels are in memory, so use CF sticky sessions (plugin sets a `JSESSIONID` cookie on the first full or `$events` response). Later option: pub/sub channel adapter. **Spike in Phase 9: verify unbuffered streaming and stickiness through the managed approuter.**
- Auth: CAP `xsuaa` or IAS. The pull provider uses technical credentials, never the user token.

## 5. Work Zone integration (UI5 wrapper component)

New package `packages/cds-htmx-shell`:

- `ui5/Component.js`: `sap.ui.core.UIComponent` with a `sap.ui.core.HTML` root (`<div class="htmx-fiori hf-root">`); loads htmx scripts/CSS, then `HtmxShell.start({ root, manifest, adapter })`.
- `shell.js` (framework-agnostic): sets `hx-headers`, connects SSE, loads client extensions. Router hooks `htmx_before_history_update` to prevent htmx's own pushState and delegates to the adapter; on hash change it calls `htmx.ajax('GET', base + path, '#app')`.
- `adapters/standalone.js`: `index.html#/Books(ID=…)`.
- `adapters/flp.js`:
  - inner-app hash `#Books-manageHtmx&/Books(ID=…)` via `HashChanger`
  - `Navigation` service: intent-based navigation; `DataFieldWithIntentBasedNavigation`, `DataFieldForIntentBasedNavigation` and `SemanticObject` links become live (currently rendered disabled), unsupported intents hidden via `isNavigationSupported`
  - `ShellUIService` for title and back; `Container.setDirtyFlag` while a draft is unsaved
  - startup parameters → initial route; related apps via `getLinks`
- **Theme/language sync**: in FLP mode skip `css_variables.css` (UI5 defines the same `--sap*` variables); swap only the fundamental-styles theme CSS on `Theming.attachApplied` (horizon, horizon_dark, hcb, hcw). UI5 language → `Accept-Language`.
- Shell mode: backend skips its shellbar (`X-Htmx-Shell: none` → existing `cds.htmx.shell`).
- **CSS/DOM isolation**: plugin CSS in `@layer htmx-fiori`, body-level rules scoped to `.hf-root` (today `body.htmx-fiori` in `public/htmx-fiori.css` and `layout.js`); dialogs/popovers mount inside `.hf-root` above the shell bar.
- App manifest: `sap.cloud: { public: true, service: "cap-htmx" }`, `crossNavigation.inbounds` (e.g. `Books-manageHtmx`), `sap.ui5.dependencies` limited to `sap.ui.core`.
- Fallback: the zip's `index.html` registered as a Work Zone **URL app**.

## 6. Frontend extensibility

Three layers. Manifest keys are the FE V4 keys.

### 6A. Declarative extension points (server-rendered from the pulled manifest)
`template: "managebooks.ext.fragment.Foo"` → `ext/fragment/Foo.fragment.html`.

- Logic-less, auto-escaped syntax `{{path}}` with OData paths; paths are collected like `expressions.paths()` so they join the SELECT.
- **Building blocks** (FE `sap.fe.macros` parity) call the existing renderers: `<hf-field path>`, `<hf-form meta-path="@UI.FieldGroup#X">`, `<hf-table meta-path="chapters/@UI.LineItem">`, `<hf-filter-field>`, `<hf-micro-chart>`, `<hf-action name>`.
- Sanitizer keeps `hx-*`, strips `<script>`, `on*`, `hx-on*`. Behaviour comes only from client extension modules (CSP-safe).

| FE V4 extension point | htmx equivalent |
|---|---|
| LR/OP custom **actions** (`content.header.actions`, `content.footer.actions`, `controlConfiguration[@UI.LineItem…].actions`, section actions; `press`, `enabled`, `visible`, `position`, `requiresSelection`, `command`, `menu`) | `<button data-hf-press="ns.ext.controller.X.onPress">`; `enabled`/`visible` as expressions evaluated server-side, or client handlers after swap |
| Custom **columns** (`template`, `header`, `width`, `horizontalAlign`, `availability`, `position`, `properties`) | fragment per cell in `render/table.js` |
| Custom **filter fields** (`filterFields`: `template`, `label`, `property`, `required`, `position`, `availability`) | fragment in `render/filter-bar.js`; value via `data/filters.js` |
| Custom **views/tabs** (`views.paths` custom `template`) | icon-tab-bar tab with fragment content |
| OP custom **sections/subsections** (`content.body.sections`: `template`, `title`, `position`, `subSections`, `actions`, `visible`) | section from fragment in `render/object-page.js` |
| OP custom **header facets** (`content.header.facets`: `template`, `title`, `stashed`, `position`) | header block from fragment |
| Custom **form elements** (`FieldGroup` `fields` with `template`, `position`) | fragment field in form grid |
| **Custom page** (`sap.fe.core.fpm` target) | `sap.htmx.pages.<id>` fragment page at `GET /$page/<id>` built from building blocks |
| Page settings (§3.2b: `initialLoad`, `tableSettings`, `sectionLayout`, …) | unchanged |

### 6B. Client controller extensions (one htmx extension `hx-fiori`)
Registered with `htmx.registerExtension`; façade mirrors FE controller-extension overrides:

```js
HtmxFiori.controllerExtension('managebooks::BooksObjectPage', {
  override: { onPageReady(ctx){}, editFlow: { onBeforeSave(ctx){}, onBeforeEdit, onBeforeDiscard, onBeforeDelete, onBeforeCreate, onAfterSave },
              routing: { onBeforeNavigation(ctx){}, onAfterBinding(ctx){} }, intentBasedNavigation: { adaptNavigationContext } },
  onPress(ctx, selected) { return this.editFlow.invokeAction('addStock', { contexts: selected, parameterValues: { quantity: 5 } }) }
})
```
- Backend tags mutating controls `data-hf-op="save|edit|discard|delete|create|action"` and page roots `data-hf-page="<targetId>"`.
- `htmx_confirm` (async `issueRequest`/`dropRequest`) → `onBefore*`; a rejected promise cancels, as in FE. `htmx_after_swap` / `HX-Trigger` → `onAfter*`, `onPageReady`. `htmx_before_history_update` → `routing.onBeforeNavigation`.
- **ExtensionAPI parity**: `refresh()`, `getSelectedContexts()`, `editFlow.invokeAction`, `routing.navigate`/`navigateToRoute`, `intentBasedNavigation.navigateOutbound`, `setFilterValues`/`getFilters`, `loadFragment(name)` (`GET /$ext/fragment/:name`), `showMessages`, `getEditMode`, `secureExecution`. `getModel` is not applicable (coverage entry).
- Modules load with `import()` from `ext/controller/*.js` (UI5 module name ↔ path under the app namespace), registered exactly as in FE under `extends.extensions["sap.ui.controllerExtensions"]`.

### 6C. Server extension SPI (backend team, co-deployed)
`cds.htmx.extensions: ["srv/htmx-ext.js"]`: custom vocabulary term handlers (`registry.js`), custom field renderers per type or `@htmx.renderer`, render hooks per page part. Business hooks remain plain CAP handlers.

### Out of scope (reported in `GET /$coverage`)
Key-user UI adaptation, persisted variant management and table personalization (later via localStorage), app variants / adaptation projects. Every manifest extension key is reported as `supported | partial | ignored`.

> The UI5 SDK pages were not reachable from the authoring environment. At the start of Phase 10, verify this matrix against ui5.sap.com (Extension Points, Controller Extensions, Building Blocks) and the Fiori elements Feature Showcase.

## 7. Sample frontend project layout
```
app/manage-books-htmx/                    # new npm workspace (root workspaces already include app/*)
  package.json   ui5.yaml (ui5-task-zipper → HTML5 repo zip)   xs-app.json
  webapp/ manifest.json  Component.js (extends cds-htmx-shell)  index.html
          annotations/annotation.xml  i18n/  ext/fragment/*.fragment.html  ext/controller/*.js
packages/cds-htmx-shell/                  # ui5/Component.js, shell.js, adapters/, ext/hx-fiori.js, ext/hx-csrf.js
packages/cds-htmx/lib/apps/               # sources.js, bundle.js, providers/{local,destination,html5-repo}.js, template.js
mta.yaml                                  # srv + html5 deployer + destination content + xsuaa
```
`app/manage-books` (FE reference app) is unchanged. The new app owns its `annotation.xml`.

## 8. Phases (each ends green)
- **6. SSE + side effects**: as planned, plus the channel records `app`.
- **7. App bundles and app-scoped rendering**: `lib/apps/*`, `local` + `destination` providers, store/cache refactor, `X-Htmx-App`/`X-Htmx-Base` handling, version-skew trigger, shell-mode fragment-only responses. Spike: html5-repo URL. Tests: two apps on one service render different LineItems; bad/unknown ids rejected; base prefix in every rendered URL; `destination` provider against an in-process HTTP stub.
- **8. FE feature parity** comes first (rounds; see the implementation plan).
- **9. Shell + Work Zone + deployment**: `cds-htmx-shell`, CSS scoping, versioned assets, sticky cookie, `app/manage-books-htmx`, `xs-app.json`, `mta.yaml`, deploy guide. Spike: SSE through `@sap/approuter` locally. Tests: Playwright standalone behind a local approuter (deep link, back/forward, CSRF); FLP sandbox for in-place hash and IBN.
- **10. Frontend extensibility**: `template.js` + sanitizer, building blocks, all §6A points, `hx-fiori` façade + ExtensionAPI, custom page, server SPI, coverage entries. Sample uses each point once (column, filter field, section, header facet, form element, action with handler, `onBeforeSave` veto, custom page). Tests: sanitizer XSS, path collection, fragment rendering and SELECT, E2E handler + veto.
- **11. E2E + visual parity + README** (former Phase 7), also covering shell mode.

## 9. Config additions (`cds.htmx`)
`apps: { sources: [{ kind: "local" }], allow: ["*"] (production: explicit list), ttl: 60000, refetchInterval: 5000, localRecheck: 1000, maxApps: 50, maxBundleBytes: 2097152, fetchTimeout: 5000 }`, `extensions: []`, `assetsVersioned: true`, `stickySessions: true`.

## 10. Phase 7 status (implemented)
Done: `lib/apps/` (registry, bundle loader, `local` + `destination` providers, `registerSourceKind()` SPI), per-app store/layout/text caches that live on the `App` instance (`model/cache.js`, `annotations/store.js`), `X-Htmx-App` / `X-Htmx-Base` handling in `HtmxAdapter#resolveApp`, fragment-only responses for app requests, `HX-Trigger: hf:appUpdated` on version skew, the channel/view remembering the app. The `annotationStoreFor` bug in the value-help route is fixed and covered by a test.

Behaviour worth knowing:
- A refresh that fails keeps serving the already loaded app (logged); a first load that fails is cached for 5 s (404 unknown app, 502 bad bundle: wrong id, a file outside the app, too many bytes).
- `local` sources are re-checked on each request after `localRecheck` ms by comparing the newest file mtime, so `cds watch` users see `annotation.xml` edits without a restart.
- Locale variants of the app's `i18n` are pulled lazily and once per locale.
- `destination` needs `@sap-cloud-sdk/http-client` when a BTP destination name is used (not a dependency of the plugin); a plain `url` works without it.

Not done / open:
- **`html5-repo` provider**: the HTML5 runtime content URL could not be verified offline. Until then use `destination`, or write a provider with `registerSourceKind('html5-repo', factory)`.
- **SourceEvents declared only in an app's annotation layer** are not registered at startup (listeners come from the service annotations and the `app/` scan). Declare them in the service annotations, or register lazily when an app loads (later).
- `X-Htmx-Shell: none` is accepted but there is no backend shellbar to hide yet (`#shell` is empty); it becomes relevant with the shell in Phase 9.
