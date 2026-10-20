# Plan: `cds-htmx` — htmx 4 protocol plugin for SAP CAP (Fiori Elements look-alike LR + OP)

## Context

The repo `cap-js-htmx` is a bare CAP 10 project (`@sap/cds ^10`, ESM root, one `CatalogService.Books` entity, no UI). Goal: a reusable **CAP plugin** that adds a new protocol `htmx`. Annotating a service with `@htmx` (like `@odata` / `@rest`) serves server-rendered HTML that looks like Fiori Elements V4 **List Report** + **Object Page** (incl. sub-object-page navigation). The **entire page layout is derived from the resulting OData annotations**: the same `$metadata` annotations FE consumes (CAP-generated EDMX/CSDL, plus any local `annotation.xml` files from FE apps). This is done through a vocabulary-driven term registry that covers UI, Common, Communication, Capabilities, Core, Measures, Validation and HTML5, including dynamic expressions. Every term is either rendered or explicitly reported as unsupported. Side effects are delivered over **SSE**. Styling comes from **SAP fundamental-styles** (Horizon theme). Sonnet will implement this plan phase by phase.

### Verified facts (from package sources, Oct 2026)
- **CAP 10.1.1** `lib/srv/protocols/index.js`: protocols come from `cds.env.protocols`. Each entry is `{ path, impl }`. `endpoints4()` maps `@<kind>` / `@protocol:'<kind>'` service annotations automatically. So registering `cds.protocols.htmx` in the plugin's `package.json` makes `@htmx` work with **zero extra code**. `@odata @htmx` serves both. The adapter is `new impl(srv, conf)`, must expose `.router` (express Router) and gets mounted as `app.use(path, cds.middlewares.before, adapter.router, after)`. Auth and `cds.context` therefore come for free. Base class: `@sap/cds/lib/srv/protocols/http.js` (`HttpAdapter`: role check from `@requires`/`@restrict`, error handler). No `exports` map, so deep require works (internal API → keep the coupling thin).
- **Plugin loading**: `cds.plugins` picks up any dependency that has a `cds-plugin.js`. The plugin `package.json#cds` section is merged into `cds.env`.
- **Lean draft** (`libx/_runtime/fiori/lean-draft.js`): events `NEW`, `EDIT`/`draftEdit`, `PATCH`, `SAVE`→`draftActivate` (`srv.send('SAVE', Entity.drafts, keys)` supported), `DISCARD`→`CANCEL`, `draftPrepare`.
- **htmx 4.0.0** (npm tag `next`; `latest` is still 2.0.11 → pin `htmx.org@4.0.0`):
  - fetch-based. Inheritance is explicit (`hx-target:inherited`). Events use colons (`htmx:after:swap`).
  - Request headers: `HX-Request`, `HX-Request-Type: partial|full`, `HX-Source`, `HX-History-Restore-Request`.
  - Multi-target responses use `<hx-partial hx-target="#id" hx-swap="…">`. Swap styles include `innerMorph` and `outerMorph`.
  - `hx-status:422="…"` sets per-status behavior. `noSwap` defaults to `[204,304]`, so **4xx/5xx bodies are swapped**.
  - History restore does a full page reload, so **every URL must render a full page**.
  - `<title>` in a response updates `document.title`. `hx-boost` exists.
  - SSE comes from the `dist/ext/hx-sse.js` extension (activated by including the script). Connect with `hx-sse:connect="url"`.
  - **Unnamed** SSE messages are swapped as HTML into the element's target, so `<hx-partial>`s work inside them.
  - **Named** events (`event: X`) are dispatched as DOM events, usable with `hx-trigger="X from:body"`.
  - *Any* response with `text/event-stream` is streamed too.
  - Docs ship in the package: `node_modules/htmx.org/dist/skills/htmx-guidance.md`, `htmx-upgrade-from-htmx2.md`, `htmx-extension-authoring.md`. **Implementer must read these. Do not use htmx 2 idioms.**
- **fundamental-styles 0.41.9** (peer: `@fundamental-styles/common-css@0.41.9`, `@sap-theming/theming-base-content@^11.36`):
  - Has `dynamic-page`, `variant-management`, `table`, `toolbar`, `shellbar`, `bar`, `icon-tab-bar`, `section`, `facet`, `form-*`, `input-group`, `select`, `dialog`, `message-strip`, `message-popover`, `message-toast`, `object-status/identifier/number/attribute`, `rating-indicator`, `progress-indicator`, `busy-indicator`, `breadcrumb`, `avatar`, `link`, and `theming/sap_horizon*.css`.
  - **No** filter-bar or object-page component, so we compose them.
  - Markup docs ship in the package: `node_modules/fundamental-styles/docs/components/*.md`. The implementer copies markup from there.
- **Compiled annotations ≠ CDS source** (verified with `cds compile --to edm`):
  - CAP adds annotations FE relies on. `@mandatory` becomes `Common.FieldControl: "Mandatory"` on `S.Books/title`. Draft roots get `@Common.SideEffects#alwaysFetchMessages`, `@Common.Messages`, draft-admin labels and `Common.DraftRoot`.
  - Association annotations move to the foreign key target (`S.Books/author_ID`).
  - Paths use OData syntax (`{"$Path":"author/name"}`). Enums are plain strings (`"High"`). `@type` is the full vocabulary URL. Nested annotations are keys like `"@Common.Text@UI.TextArrangement"` or `"@UI.Importance"` inside records.
  - `cds.compile.to.edm(csn,{service})` (CSDL JSON, `$Annotations` keyed by target) and `cds.compile.to.edmx` both exist in CAP 10. **We consume CSDL JSON**, the same content FE gets as XML.
- Network: github.com / four.htmx.org are blocked here and npm works. So **serve all assets locally from node_modules** (no CDN by default).

## Decisions (defaults; change before implementation if desired)
1. **Monorepo with npm workspaces.** The plugin lives in `packages/cds-htmx` (package name `cds-htmx`, CommonJS). The root app stays as the demo and test fixture and depends on `"cds-htmx": "*"`.
2. **Draft-enabled editing is the primary edit flow**, matching FE + CAP (`@odata.draft.enabled`). Non-draft entities render the OP read-only (direct-edit is out of scope for v1).
3. **Server-side rendering with dependency-free tagged templates** (`html\`…\`` with auto-escaping plus `raw()`). No template engine dependency.
4. **Theme `sap_horizon`.** Configurable via `cds.htmx.theme`.
5. **One SSE channel per browser page** (client id). Side-effect results and server-triggered events (`SourceEvents`) are pushed through it as `<hx-partial>` bundles.
6. Expand the sample model (Books/Authors/Genres/Chapters) so every supported annotation and side effect is exercised.
7. **Annotations come from the compiled OData annotations, not CSN.**
   - Sources are layered the way FE layers them: service `$metadata` (CAP-compiled CSDL JSON) first, then local `annotation.xml` files referenced by FE app manifests targeting the same service (later wins per target + term + qualifier).
   - A **term registry** turns each annotation into a layout model, with an explicit coverage status per term (`supported | partial | ignored`).
   - **Dynamic expressions** (`$Path`, `$If`, `$Eq`…, `$Apply`) are evaluated per row/object.
8. **FE manifest settings are honored when an FE app for the entity set exists**, because FE layout = annotations + manifest page settings. Otherwise FE defaults are used.
9. **Frontend apps are pulled at runtime.** The backend fetches an app's declarative bundle (manifest, annotation XML, HTML fragments, i18n) through a pluggable AppSource provider (`local` | `destination` | `html5-repo`) and caches it per `appId@version`. Server-side code is never loaded from a bundle. See `FRONTEND_DEPLOYMENT_AND_EXTENSIBILITY.md` §3.
10. **Work Zone integration uses a UI5 wrapper component** (`packages/cds-htmx-shell`) hosting the htmx shell in-place in the FLP; an `index.html` URL-app is the fallback. The app routes `/htmx/**` through the HTML5 app's `xs-app.json` to the CAP destination, like FE `/odata/` routes.
11. **The FE V4 `manifest.json` is the frontend app descriptor** (plus a small `sap.htmx` block), and frontend extensions use the same manifest keys as FE V4's flexible programming model (§3.2b, design doc §6).

---

## 1. Repository layout

```
package.json                      # root demo app: workspaces ["packages/*"], deps: @sap/cds, cds-htmx; devDeps: @cap-js/sqlite, @cap-js/cds-test (needed for cds.test since CAP 9), @playwright/test, pixelmatch, pngjs, node-html-parser
db/schema.cds                     # domain model (namespace sap.capire.bookshop)
db/data/*.csv                     # Books, Authors, Genres, Chapters, sap.common-Currencies
srv/cat-service.cds               # @odata @htmx service CatalogService { Books(draft), Authors, Genres(@readonly) ; actions ; event StockChanged }
srv/cat-service.js                # demo handlers: computed stockStatus/criticality, totalPages, addStock action, simulateDelivery → emits StockChanged
app/annotations.cds               # ALL UI annotations (shared by htmx + FE reference app)
app/manage-books/                 # generated FE V4 app (sap.fe.templates.ListReport / ObjectPage)
  webapp/{manifest.json,Component.ts,index.html}
  webapp/annotations/annotation.xml               # local XML annotation layer (overrides/extends service annotations; consumed by BOTH FE and htmx)
app/index.html                    # landing page: links to /htmx/catalog/ and /manage-books/webapp/index.html
packages/cds-htmx/
  package.json                    # name cds-htmx, type commonjs, deps: htmx.org@4.0.0, fundamental-styles@0.41.9, @fundamental-styles/common-css@0.41.9, @sap-theming/theming-base-content@^11.36, fast-xml-parser (annotation.xml); peerDep @sap/cds>=9
                                  # "cds": { "protocols": { "htmx": { "path": "/htmx", "impl": "cds-htmx/lib/HtmxAdapter.js" } }, "htmx": { defaults… } }
  cds-plugin.js                   # mounts static assets once (cds.on('bootstrap')), registers SourceEvents listeners (cds.on('serving')), SSE shutdown on cds 'shutdown'
  index.cds                       # optional: @htmx.* custom annotation vocab docs (none required v1)
  _i18n/i18n*.properties          # UI texts copied to match FE wording (Go, Adapt Filters, Create, Delete, Edit, Save, Discard Draft, Draft saved, Object saved., No data found. Try adjusting the filter settings., Editing Status, All, Own Draft, Locked by Another User, Unsaved Changes by Another User, Unchanged, …)
  lib/
    HtmxAdapter.js                # extends HttpAdapter; builds router (routes table below)
    assets.js                     # express.static for htmx dist + ext, fundamental-styles dist, common-css, theming-base-content fonts/css vars, ./public
    config.js                     # merged cds.env.htmx with defaults
    keys.js                       # parse/format OData-style key segments: Books(ID=…,IsActiveEntity=true)/chapters(ID=…)
    i18n.js                       # resolve {i18n>key} and plugin texts by req locale (cds.i18n.labels / bundle4)
    annotations/                  # §3.1 — the "resulting annotations" pipeline
      source.js                   # cds.compile.to.edm(cds.model,{service, ...cds.env.odata}) → CSDL JSON; + local annotation.xml layers
      xml.js                      # EDMX/annotation.xml → CSDL-JSON-shaped $Annotations (fast-xml-parser); handles <Annotations Target>, Record/Collection/PropertyValue, dynamic expr elements
      manifest.js                 # scan app/**/webapp/manifest.json: dataSources (OData uri ↔ service path, ODataAnnotation localUri), routing targets → page settings
      vocab.js                    # alias/namespace normalization (com.sap.vocabularies.UI.v1 ↔ UI, @type URL → 'UI.DataField'), default record types per term
      store.js                    # merged AnnotationStore: get(target, term, qualifier), targetsOf(entityType), nested "@T@T2" access, layered override
      edm.js                      # EDM ↔ CSN mapping: entity sets/types, properties, FK props (author_ID), navigation paths (author/name → author.name), actions/functions + overload targets, flat vs structured
      expressions.js              # evaluate(expr,row,ctx) for $Path/$If/$Eq/$Ne/$Gt/$Ge/$Lt/$Le/$And/$Or/$Not/$Apply(odata.concat, odata.fillUriTemplate, odata.uriEncode)/$LabeledElement/$Null/$EnumMember; paths(expr) → columns to SELECT
      registry.js                 # term handlers {term, appliesTo, status, build(value,ctx), paths(value)}; coverage report
      terms/                      # one module per vocabulary: ui.js, common.js, communication.js, capabilities.js, core.js, measures.js, validation.js, html5.js
    model/                        # layout models built ONLY from the AnnotationStore (+ manifest settings + FE defaults)
      list-report.js              # entity set → LRLayout {header, filterBar, views[], table{columns, actions, sort, group, selection, growing}, capabilities}
      object-page.js              # entity set/nav → OPLayout {title, headerFacets, headerActions, footerActions, sections[{id,title,subsections[...]}], editableHeader}
      fields.js                   # property → FieldLayout {label, quickInfo, text/textArrangement, unit/currency/scale, valueList/fixedValues, fieldControl(expr), hidden(expr), computed/immutable, validation, semantic (email/phone/url/image), multiline, placeholder, width}
      side-effects.js             # Common.SideEffects (entity type, bound actions), index by source property/entity/event
      fe-defaults.js              # FE V4 defaults when no manifest (ResponsiveTable, initialLoad Auto, sectionLayout Page, growingThreshold 20, …)
      cache.js                    # per-model cache (rebuild on cds.model change in watch mode / annotation.xml change)
    data/
      query.js                    # LRModel+filters → CQL SELECT (columns incl. text/unit/criticality/nav paths, draft cols, .search(), where, orderBy, limit)
      filters.js                  # parse query-string filters → CXN where (eq, multi-value in, ranges, EditingStatus)
      draft.js                    # thin wrappers: create(NEW), edit(EDIT), patch(UPDATE drafts), save(SAVE), discard(DISCARD), lockInfo
      actions.js                  # invoke bound/unbound actions with params; collect req.messages
    render/
      html.js                     # html`` tag, escape(), raw(), attrs(), classMap()
      layout.js                   # full document: <head> css+scripts, shellbar, #app, #messages, #toast, SSE connector, client-id header
      list-report.js  filter-bar.js  table.js  growing.js
      object-page.js  op-header.js  anchor-bar.js  section.js  form.js  footer.js
      field.js                    # display + edit renderers per type (see §3.4)
      value-help.js  dialog.js  messages.js  toast.js  breadcrumbs.js
      ids.js                      # deterministic DOM ids: lr-table, op-field--{facetId}--{path}, op-section--{id}, …
    sse/
      channels.js                 # Map<clientId,{res,user,locale,view:{entity,keys,mode}}>, heartbeat, cleanup
      stream.js                   # write(res,{event,data,id}) splitting data on \n per SSE spec
      side-effects-engine.js      # after PATCH/action/event → resolve targets → render fragments → publish
  public/
    htmx-fiori.css                # @font-face for '72' + SAP-icons (from theming-base-content), FE-parity tweaks (spacing, sticky header/footer, row hover, nav arrow column)
    htmx-fiori.js                 # tiny client glue: filter-bar collapse/pin, table selection → enable Delete, dialog open/close, toast auto-hide, popover toggles, focus restore after morph
  test/ (see §6)
```

Added by Phases 7–9 (see `FRONTEND_DEPLOYMENT_AND_EXTENSIBILITY.md` §7): `packages/cds-htmx/lib/apps/` (AppSource providers, bundles, fragment templates), `packages/cds-htmx-shell/` (UI5 wrapper component, shell runtime, `hx-fiori` / `hx-csrf` extensions), `app/manage-books-htmx/` (sample frontend project with its own `annotation.xml`), and `mta.yaml`.

## 2. Plugin wiring
- `packages/cds-htmx/package.json#cds.protocols.htmx = { path: "/htmx", impl: "cds-htmx/lib/HtmxAdapter.js" }`. CAP resolves `impl` from `cds.root`, so the workspace symlink works. Service `@htmx` is served at `/htmx/catalog`; `@htmx: '/books'` gives a custom path.
- `cds-plugin.js`:
  - `cds.on('bootstrap', app => app.use('/htmx/-/', assets.router))`. Shared static assets are mounted once, not per service.
  - `cds.on('serving', srv => { if (srv.endpoints?.some(e=>e.kind==='htmx')) sideEffects.registerSourceEvents(srv) })`.
  - `cds.on('shutdown', channels.closeAll)`.
- `HtmxAdapter extends HttpAdapter`. Its `get router()` calls `super.router` (adds the role check), then adds `express.urlencoded` + `express.json` body parsers (use `this.body_parser_options`) and the routes below. In the router, wrap each handler in `srv.tx(tx => …)` so one request = one transaction. All reads and writes go through **the service** (never `cds.db`) so `@restrict`, `@readonly`, custom handlers, validation and draft logic all apply.
- Full vs. fragment response:
  - If `HX-Request` is present **and** `HX-History-Restore-Request` is absent, return a fragment: the page content swapped into `#app`, plus `<title>`.
  - Otherwise return the full document from `layout.js`.

### Routes (relative to the service path, e.g. `/htmx/catalog`)
| Method & path | Purpose |
|---|---|
| `GET /` | FLP-like home: one tile per entity that has `@UI.LineItem` |
| `GET /:Set` | List Report |
| `GET /:Set/$table?…filters,$search,$orderby,$skip` | Table body/rows (Go, sort, growing "More"). Also updates the toolbar count via `<hx-partial>` |
| `GET /:Set(keys)[/nav(keys)…]` | Object Page / sub-object page (display or edit depending on `IsActiveEntity`) |
| `POST /:Set` | Create (NEW draft), then `HX-Push-Url` + render the OP in edit mode |
| `POST /…(keys)/$edit` | EDIT, then the draft OP. If locked by another user, return 409 with a message box |
| `PATCH /…(keys)/$field/:path` | Patch a single draft field. Returns the re-rendered field (value state) + "Draft saved" indicator; then the side-effects engine fires |
| `POST /…(keys)/$save` | SAVE. On success: active OP + toast "Object saved." On error: 422 + field value states + message popover |
| `POST /…(keys)/$discard` | DISCARD. A new draft goes back to the LR; otherwise the active OP |
| `POST /:Set/$delete` / `DELETE /…(keys)` | Delete selected rows (LR) / the object (OP), after a confirm dialog |
| `POST /…/(keys)/:nav` | Create a child in a table section (inline new row in the draft) |
| `GET /…/$action/:name` / `POST …` | Action parameter dialog / execute (bound or unbound). Then run the action side effects |
| `GET /:Set/$vh/:path?search` | Value-help dialog / suggestions (`@Common.ValueList`); fixed values render as a select |
| `GET /$events?client=<id>` | SSE stream (`text/event-stream`, heartbeat comment every 15 s) |
| `GET /$annotations` · `GET /$coverage` | Debug: merged annotation store (JSON) · term coverage report (dev only, disabled in production) |

## 3. Backend: annotations → UI models → HTML

### 3.1 Annotation pipeline: resulting annotations → layout

```
cds.model ──cds.compile.to.edm(service)──► CSDL JSON $Annotations ─┐
app/**/webapp/manifest.json → localUri annotation.xml ──xml.js──────┼─► AnnotationStore (layered, alias-normalized)
                                                                   │        │
manifest routing targets (page settings) ──manifest.js─────────────┘        ▼
                                              term registry (terms/*.js) ─► LRLayout / OPLayout / FieldLayout ─► render/*
                                                                            ▲
                                       expressions.js (per-row eval + column collection) ─► data/query.js SELECT columns
```

1. **Source**: compile once per `@htmx` service with the project's `cds.env.odata` options, so paths match `$metadata` exactly (flat vs structured, FK names).
   - Cache per `cds.model` instance and invalidate on `cds watch` reload.
   - Debug route `GET /$annotations` returns the merged store as JSON. Use it to diff against `/odata/v4/catalog/$metadata`.
2. **Local XML layers**: for each FE app manifest whose `sap.app.dataSources.*.uri` points to the same service, load `ODataAnnotation` dataSources (`settings.localUri`, in manifest order) and merge them over the service annotations.
   - Merge key: target + term + qualifier; later wins. This matches FE.
   - The XML parser covers all of these:
     - attribute shortcuts (`Path=`, `String=`, `Bool=`, `EnumMember=`, `PropertyPath=`, `AnnotationPath=`, `NavigationPropertyPath=`)
     - `<Record Type>`, `<Collection>`, `<PropertyValue>`
     - nested `<Annotation>`
     - expression elements (`<If>`, `<Eq>`, `<Apply Function>`, `<Path>`, `<Null>`, `<LabeledElement>`)
     - `<edmx:Reference>`/`<edmx:Include Alias>` alias resolution
3. **Vocab normalization**:
   - Every term becomes `Alias.Term` with the standard aliases (`UI`, `Common`, `Communication`, `Capabilities`, `Core`, `Measures`, `Validation`, `HTML5`, `Analytics`, `Aggregation`, `Session`). Namespace and alias forms are both accepted.
   - `@type` URLs become short type names. A missing `@type` takes the term's default record type (e.g. a `UI.LineItem` entry → `UI.DataField`).
4. **Targets** (`edm.js`): `S.Books`, `S.Books/title`, `S.EntityContainer/Books` (set-level, e.g. Capabilities), action overloads `S.addStock(S.Books)` and their parameters `S.addStock(S.Books)/quantity`.
   - Navigation-relative annotation paths resolve through the target type: `chapters/@UI.LineItem`, `author/@Communication.Contact`.
5. **Strings and i18n**: CAP already resolves `{i18n>…}` per locale at compile time. Compile once per locale lazily (`cds.compile.to.edm(…, {locale})`) or use CAP's localized metadata cache. Label fallback chain (FE order): `DataField.Label` → property `Common.Label` → property name.
6. **Expressions**: every annotation value that FE allows to be dynamic (Hidden, FieldControl, Criticality, OperationAvailable, Insertable/Updatable/Deletable paths, UpdateHidden/DeleteHidden/CreateHidden, Label via `$Apply`, ImageUrl…) is kept as an expression object.
   - `paths(expr)` feeds the SELECT columns. `evaluate(expr, row)` is applied at render time, per row (tables) or per object (OP).
7. **Coverage**:
   - `registry.coverage(store)` lists every term found in the store with `supported | partial | ignored(reason) | unknown`.
   - `GET /$coverage` renders it as an fd-table.
   - At startup, log one warning per **unknown** term.
   - A test fails if the sample model contains an unknown term (§7).

### 3.2 Term → layout coverage matrix (target: everything FE V4 LR/OP renders)
| Vocabulary | Terms → layout effect | Status |
|---|---|---|
| **UI** | `HeaderInfo` (TypeName/Plural → table title, shell title, "New {TypeName}"; Title/Description → OP title/subtitle; ImageUrl/TypeImageUrl/Initials → avatar) | supported |
| | `LineItem[#Q]` → table columns. Record types: DataField, DataFieldWithUrl (link), DataFieldWithNavigationPath (link to sub-OP), DataFieldWithAction (link-triggered action), DataFieldForAction (toolbar button; `Inline` → row button; `Determining` → OP footer), DataFieldForAnnotation (DataPoint / Contact quick-view / FieldGroup stacked cell / Chart micro chart), DataFieldWithIntentBasedNavigation & DataFieldForIntentBasedNavigation (rendered disabled/plain — no FLP), plus `Criticality`, `CriticalityRepresentation`, `IconUrl`, `@UI.Importance` (pop-in), `@UI.Hidden`, `@HTML5.CssDefaults.width` | supported |
| | `SelectionFields` → filter-bar order; `HiddenFilter` → excluded | supported |
| | `PresentationVariant[#Q]` (SortOrder, GroupBy → grouped rows, Visualizations → which LineItem/Chart, RequestAtLeast, MaxItems), `SelectionVariant[#Q]` (default filter values), `SelectionPresentationVariant[#Q]` (LR default; with manifest `views` → icon-tab-bar multi views) | supported |
| | `Facets` / `HeaderFacets`: ReferenceFacet → FieldGroup, Identification, LineItem (via navigation), DataPoint, Chart, Communication.Contact/Address, PresentationVariant; CollectionFacet → section/subsections (nesting); facet `ID` (anchor + DOM id), `Label`, `@UI.Hidden` (expr), `@UI.PartOfPreview: false` (collapsed "Show More" block), `@UI.Importance` | supported |
| | `FieldGroup[#Q]` → form container; `Identification` → header actions + Identification form; `ConnectedFields` → combined "A / B" field via Template | supported |
| | `DataPoint[#Q]` → Value/Title/Description, Criticality/CriticalityCalculation, TargetValue, `Visualization` Number/Rating/Progress, `ValueFormat` (ScaleFactor, NumberOfFractionalDigits) | supported |
| | `Chart[#Q]` → header/inline **micro charts** (Bullet, Radial, Area, Column, Line, Comparison, StackedBar, Harvey) as inline SVG; chart in OP section → simple SVG column/bar chart | partial |
| | `Hidden` (static/expr), `TextArrangement` (entity- or property-level), `MultiLineText`, `Placeholder`, `IsImageURL`/`IsImage` (avatar/image), `CreateHidden`/`UpdateHidden`/`DeleteHidden` (expr), `Criticality`, `IsCopyAction` (Copy button), `DoNotCheckScaleOfMeasureQuantity` | supported |
| | `Badge`, `Note`, `Recommendations`, `QuickViewFacets`/`QuickCreateFacets`, KPI/`Spreadsheet`-related terms | ignored (listed in coverage) |
| **Common** | `Label`, `Heading`, `QuickInfo` (tooltip), `Text` + `@UI.TextArrangement`, `TextFor`, `SemanticKey` (bold key + draft status in 1st column), `FieldControl` (static/expr: Hidden/ReadOnly/Optional/Mandatory/Inapplicable) | supported |
| | `ValueList[#Q]` (CollectionPath, Parameters In/Out/InOut/DisplayOnly/Constant/FilterOnly, SearchSupported, Label, PresentationVariantQualifier), `ValueListWithFixedValues` (select / multi-combo in filters), `ValueListRelevantQualifiers`, `ValueListForValidation` | supported |
| | `SideEffects[#Q]` (incl. CAP-generated `#alwaysFetchMessages`, SourceEvents, TriggerAction), `Messages` / `DraftMessages`, `IsActionCritical` (confirm dialog), `DefaultValuesFunction` (create defaults), `FilterDefaultValue`, `FilterExpressionRestrictions` → per-filter control (SingleValue/MultiValue/SingleRange/MultiRange) | supported |
| | `DraftRoot`/`DraftNode` (Activation/Edit/Preparation actions), `IsUpperCase`, `IsDigitSequence`, `IsCalendarDate`/Year/Month… (formatting), `Masked`, `Timezone`, `SemanticObject` (link disabled — no FLP), `SAPObjectNodeType` | supported / partial |
| **Communication** | `Contact` (quick-view popover `fd-quick-view` + Contact facet), `Address`, `IsEmailAddress` (mailto), `IsPhoneNumber` (tel) | supported |
| **Capabilities** | `Insert/Update/DeleteRestrictions` (+ path-based `Updatable`/`Deletable`), `NavigationRestrictions` (child tables), `SearchRestrictions` (search field), `FilterRestrictions` (RequiredProperties → mandatory filters, initial load blocked until filled; NonFilterableProperties), `SortRestrictions` (NonSortableProperties), `CountRestrictions`, `TopSupported`/`SkipSupported` (growing) | supported |
| **Core** | `Computed`, `Immutable` (editable only on create), `Permissions`, `OperationAvailable` (expr → button enabled), `Description`/`LongDescription` (tooltips), `IsURL`, `MediaType`/`IsMediaType`, `OptimisticConcurrency` (ETag on PATCH/SAVE), `Links` | supported / partial |
| **Measures** | `ISOCurrency`, `Unit`, `Scale` → "12.50 EUR" display and paired unit input | supported |
| **Validation** | `Minimum`/`Maximum`, `AllowedValues`, `Pattern` → input attributes + messages (server stays authoritative) | supported |
| **HTML5** | `CssDefaults.width` → column width | supported |
| **Analytics / Aggregation / Session** | ALP, analytical tables, sticky (non-draft) editing | ignored v1 (listed in coverage) |

Rule: a layout model is built **only** from the store (+ manifest + FE defaults), never from ad-hoc CSN annotation reads. CSN is used only for runtime typing and queries (via `edm.js`).

### 3.2b Manifest page settings (when an FE app exists)
Read `sap.ui5.routing.targets[*].options.settings` for `sap.fe.templates.ListReport`/`ObjectPage`:
- `contextPath`/`entitySet`, `navigation` (which OP target a row opens)
- `initialLoad`, `variantManagement`
- `views.paths` (multi-view tabs)
- `controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem#Q"].tableSettings` (`type`, `selectionMode`, `creationMode`, `condensedTableLayout`, `enableExport`, `personalization`, `growingThreshold`)
- `columns` overrides, `sectionLayout` (Page | Tabs), `editableHeaderContent`, `content.header.visible`, `showRelatedApps`

Without a manifest, use `fe-defaults.js`. Until Phase 9, custom extensions (fragments, controller extensions) are ignored and listed in coverage. From Phase 9 they are resolved to `.fragment.html` templates and `hx-fiori` controller extensions (design doc §6). From Phase 7 the manifest may come from an app bundle (`X-Htmx-App`) instead of the `app/` scan.

### 3.3 Data access (`data/*`)
- SELECT columns come from the layout model, never hand-picked. For each table/page, the union of `paths()` over all rendered annotation values is used, mapped OData → CQL by `edm.js` (`author/name` → `author.name`, `author_ID`). That union covers:
  - Value, Text, Unit/Currency, Criticality and expression paths (Hidden, FieldControl, OperationAvailable, Updatable…)
  - DataPoint/Chart measures, HeaderInfo, SemanticKey
  - the key
  - for draft roots also `IsActiveEntity, HasActiveEntity, HasDraftEntity, DraftAdministrativeData{InProcessByUser,LastChangedByUser}`.
- `$count` via `SELECT.one.from(...).columns('count(1) as count')` with the same where.
- LR draft semantics are FE's "All" default: active rows plus own drafts replacing their active rows. Reading `Books` through the service with lean draft handles this; verify in the Phase 0 spike.
- Paging: `growingThreshold` default 20 (FE responsive table), "More [20 / 57]".
- Filters come from the query string (`f.author_ID=1&f.author_ID=2&f.stock.ge=10&$search=…&f.EditingStatus=OWN_DRAFT`). The parser whitelists element names against the model (no injection).

### 3.4 Rendering rules (FE-parity checklist the implementer must follow)
Use fundamental-styles markup exactly as in `node_modules/fundamental-styles/docs/components/*.md`.
- **Shell**: `fd-shellbar` with the SAP logo, title = TypeNamePlural (on the OP: TypeName) and a user avatar with initials from `cds.context.user.id`. "Home" (`/`) mimics FLP tiles (`fd-tile`).
- **List Report** = `fd-dynamic-page`:
  - Title area: `fd-variant-management` showing "Standard" with a ▾ (non-functional dropdown listing "Standard").
  - Collapsible header = **filter bar**: a flex-wrap row of `fd-form-item`s with the label above the input. Order is Search (`fd-input-group` with search icon), then "Editing Status" for draft entities, then the SelectionFields. On the right: "Go" (`fd-button--emphasized`) and "Adapt Filters (n)" (transparent). There is a header collapse/pin control.
  - Content: a `fd-toolbar` titled "Books (57)" (`fd-title--h5`) with spacer, Create, Delete (disabled until a selection exists), action buttons, and a settings icon. Then `fd-table fd-table--responsive`:
    - checkbox column; header cells open a sort popover (Ascending/Descending); rows are `fd-table__row--activable fd-table__row--hoverable` with a navigation arrow cell (`sap-icon--slim-arrow-right`).
    - draft rows show a "Draft" / "Locked by …" link (`fd-link` + `fd-object-status`) under the first column.
    - empty state: "No data found. Try adjusting the filter settings." Then the growing "More" button.
  - `UI.Importance` decides which columns become pop-in when space is narrow (CSS container query).
- **Object Page** = `fd-dynamic-page`:
  - Title: `fd-breadcrumb` (sub-OP), Title (HeaderInfo.Title value), subtitle (Description), and the header action toolbar: Edit (emphasized), Delete, Identification actions.
  - Header content: `fd-avatar` + header facets as horizontally wrapped blocks (FieldGroup → label/value pairs; DataPoint → title + `fd-object-number`/`fd-object-status`/`fd-rating-indicator`/`fd-progress-indicator`).
  - Anchor bar: `fd-icon-tab-bar` text-only with scroll-spy. It is hidden when there is only one section.
  - Sections: `fd-section` with title. Each FieldGroup is a form container in a responsive column grid (`fd-form-layout-grid`, up to 3 columns at L/XL), label above value (Horizon). Empty values show "–". Table subsections reuse `table.js` with the toolbar "Chapters (n)" and Create/Delete when editable.
  - Edit (draft) mode:
    - inputs replace values; mandatory fields get `fd-form-label--required`; read-only and computed fields stay text.
    - floating footer `fd-bar fd-bar--floating-footer` with a messages button (red count) on the left, then "Draft saved" status, Save (emphasized) and Discard Draft.
    - the title shows "New Book" for a new draft.
- **Field renderers** (`field.js`):

  | Type | Edit renderer | Display formatting |
  |---|---|---|
  | String | `fd-input` (`UI.MultiLineText` → `fd-textarea`) | — |
  | Integer/Decimal | numeric input | `Intl.NumberFormat(locale)` |
  | Boolean | `fd-checkbox` | "Yes/No" |
  | Date/DateTime/Time | native date/time input styled `fd-input` | `Intl.DateTimeFormat` |
  | Association + ValueList | `fd-input-group` with value-help icon → `fd-dialog` with search + `fd-table` of `ValueList.Parameters` | — |
  | ValueListWithFixedValues | `fd-select`/native select | — |
  | Amount + currency | — | `fd-object-number` |
  | Criticality | — | `fd-object-status--negative/critical/positive/informative` with FE icons |

  Each field occurrence gets a stable id from `ids.js` so side effects and morphing can target it.
- **Messages**: `req.messages` warnings/info become `fd-message-strip` / `fd-message-popover`. Errors with a `target` set the field value state (`is-error` + `fd-form-message`). Success shows a toast in `fd-message-toast` ("Object saved.", "Object deleted.").
- **Navigation**: rows and links use `hx-get` + `hx-push-url="true"` + `hx-target="#app"` + `hx-swap="innerHTML show:window:top"`. Row clicks ignore the checkbox cell (`hx-trigger="click[!event.target.closest('.fd-table__cell--checkbox')]"`). Browser back works through history + full-page rendering of every URL.
- **Security**: escape everything by default via the `html` tag. Only `raw()` our own fragments. Never interpolate user input into attribute names or `hx-on`. Include a CSRF strategy: htmx sends `HX-Request`; reject state-changing requests without `HX-Request`, plus the `SameSite` default cookie behavior.

## 4. Side effects via SSE

### 4.1 Channel
- A full page render generates `clientId = cds.utils.uuid()` and emits:
  - `<body hx-headers:inherited='{"X-Htmx-Client":"<id>"}'>`
  - `<div id="sse" hx-sse:connect="/htmx/catalog/$events?client=<id>" hx-swap="none">`
  - Phase 0 spike confirms that `<hx-partial>` is processed with `swap:none`. If not, use `hx-swap="beforeend"` into a hidden sink.
- `channels.js` stores `{res, user: cds.context.user, locale, app, view}` per client (`app` = validated `X-Htmx-App` id, so pushed renders use the same app layout). Every OP GET updates `view = {entity, keys, mode}` for the requesting client. Closing the stream removes the client.
- `stream.js` writes `id:` and `data:` lines (one per HTML line) and `\n\n`. It sends a heartbeat `: ping` every 15 s and sets `X-Accel-Buffering: no`.

### 4.2 Engine (`side-effects-engine.js`)
Side effects are read from the AnnotationStore. That includes CAP-generated ones such as `#alwaysFetchMessages` (`SourceEntities:['']` → `TargetProperties:['DraftMessages']`), which re-renders the message popover and field value states after every draft change, exactly like FE.

1. **Field change** (`PATCH $field/:path`):
   - Respond immediately with the patched field.
   - Then resolve side effects whose `SourceProperties` contain `path`, or whose `SourceEntities` contain the changed child navigation (for table-row edits).
   - If `TriggerAction` is set, call it on the draft first.
   - Then re-read the draft with only the target columns and render:
     - `TargetProperties`: each rendered occurrence of the property (header + sections + title).
     - `TargetEntities`: the whole table subsection / navigation section.
     - `''` or `'*'` targets: the full OP content, using `outerMorph` to preserve focus.
   - Publish the result as a single SSE message of `<hx-partial hx-target="#id" hx-swap="outerMorph">` blocks to that client. Also send a named event `htmx:fe:sideEffects` so the client can show a busy state.
2. **Action side effects**: the bound action's `@Common.SideEffects` decides what is re-rendered after execution. The default (no annotation) re-renders the OP, which matches FE.
3. **Server-triggered (`SourceEvents`)**, FE's push-channel side effects mapped to SSE:
   - For every entity side effect with `SourceEvents: ['StockChanged']`, `srv.on('StockChanged', …)` is registered.
   - On emit (payload contains the entity keys), find all channels whose `view` matches the entity + keys.
   - For each, re-render the targets in a new `cds.tx({user, locale})` and push them.
   - LR clients get the affected row re-rendered (by row id) when the event carries keys. This is an extension beyond FE, guarded by `cds.htmx.liveListReport` (default true).
4. Side effects in FE fire on field change in edit mode only. The engine therefore ignores active-entity PATCHes. Document in README that FE's "deferred until field group left" timing is simplified to "on change".

## 5. Frontend (runnable page)
> Standalone mode below stays as is. From Phase 8 a generic shell (`cds-htmx-shell`) can host the same pages in Work Zone; the backend then returns fragments only and prefixes all URLs with `X-Htmx-Base`.

- No separate SPA. The plugin renders the full HTML shell, so `npm run watch` → `http://localhost:4004/htmx/catalog/` is the app. `app/index.html` links to both the htmx app and the FE reference app.
- `layout.js` `<head>`:
  - `/htmx/-/theming-base-content/content/Base/baseLib/sap_horizon/css_variables.css`
  - `/htmx/-/fundamental-styles/dist/theming/sap_horizon.css`, `/htmx/-/common-css/…`, `/htmx/-/fundamental-styles/dist/fundamental-styles.css`
  - `/htmx/-/public/htmx-fiori.css`
  - `<meta name="htmx-config" content='{"extensions":"sse"}'>`
  - scripts `htmx.min.js`, `ext/hx-sse.min.js`, `public/htmx-fiori.js`
- `<body class="htmx-fiori">` contains `#shell`, `#app`, `#messages`, `#toast`, `#dialogs`, `#sse`.
- `htmx-fiori.js` is limited to UI-only behavior FE does client-side: filter-bar collapse/pin, selection state, popovers/dialog visibility, anchor-bar scroll-spy, toast timeout, a global `htmx:error` → `fd-message-box`. No data logic.

## 6. Sample app (root) — exercises everything
- `db/schema.cds`:
  - `Books : cuid, managed { title @mandatory, descr, author: Association to Authors @mandatory, genre: Association to Genres, stock: Integer, price: Decimal(9,2), currency: Currency, rating: Decimal(2,1), stockStatus: String @Core.Computed, stockCriticality: Integer @Core.Computed, totalPages: Integer @Core.Computed, chapters: Composition of many Chapters }`
  - `Chapters { title, pages }`, `Authors { name, dateOfBirth, books }`, `Genres : CodeList`.
  - Migrate the existing 5 books into the new CSVs.
- `srv/cat-service.cds`: `@odata @htmx service CatalogService { @odata.draft.enabled entity Books …; entity Authors; @readonly entity Genres; action simulateDelivery(book: UUID, qty: Integer); event StockChanged { ID: UUID } }`. The bound action is `Books.addStock(quantity: Integer)`.
- `srv/cat-service.js`:
  - compute `stockStatus`/`stockCriticality` on PATCH/READ of `stock`.
  - recompute `totalPages` on chapter changes.
  - `simulateDelivery` updates the active book and `this.emit('StockChanged', {ID})`.
- `app/annotations.cds`: full LR/OP annotations, including
  - `@Common.SideEffects #Stock: { SourceProperties:[stock], TargetProperties:['stockStatus','stockCriticality'] }`
  - `#Pages: { SourceEntities:[chapters], TargetProperties:['totalPages'] }`
  - `#Push: { SourceEvents:['StockChanged'], TargetProperties:['stock','stockStatus','stockCriticality'] }`
  - action-level side effects on `addStock`.
  - **Breadth annotations so every "supported" term in §3.2 appears at least once**:
    - Books: HeaderInfo with TypeImageUrl, SelectionPresentationVariant, HeaderFacets with DataPoint Rating + Progress + micro chart, ConnectedFields (price / currency), CollectionFacet with nested FieldGroups, `PartOfPreview:false`.
    - expression-based `UI.Hidden` / `Common.FieldControl` / `Core.OperationAvailable` / `UpdateHidden`.
    - `IsActionCritical`, `DefaultValuesFunction`, `FilterDefaultValue`, `FilterExpressionRestrictions`, Validation `Minimum`/`Maximum`.
    - Authors: `Communication.Contact`, `IsEmailAddress`/`IsPhoneNumber`, DataFieldWithNavigationPath.
- `app/manage-books/webapp/annotations/annotation.xml`: a small XML layer that **overrides** one term (e.g. a different `UI.LineItem` column order + Label) and **adds** one (e.g. `UI.FieldGroup#Extra` + facet). This proves XML layering affects both UIs identically.
- `app/manage-books`: a FE V4 app (`sap.fe.templates.ListReport` / `ObjectPage`, `contextPath:/Books`, sub-OP for chapters) on `/odata/v4/catalog/` for visual comparison.

## 7. Testing
- **Runner**: `node --test` with `cds.test` (CAP 10 supports node:test) and `node-html-parser` for HTML assertions. Scripts: `npm test` (unit + integration), `npm run test:e2e` (Playwright).
- **Unit** (`packages/cds-htmx/test/unit/`):
  - **annotation pipeline**:
    - `source.js` output equals what `/odata/v4/catalog/$metadata` contains (parse the EDMX via `xml.js`, then deep-compare `$Annotations`). This is a **golden test**: htmx sees exactly what FE sees.
    - `xml.js` fixtures for every XML construct (shortcuts, Record/Collection, nested annotations, `If`/`Eq`/`Apply`, aliases).
    - layering precedence (target + term + qualifier, later wins).
    - vocab alias normalization; default record types.
  - `expressions.js`: truth tables for every operator, `paths()` collection, null handling.
  - **coverage test**: every term in the sample's merged store is `supported | partial | ignored`. **No `unknown`.**
  - **layout snapshot tests**: `LRLayout`/`OPLayout` JSON for Books, Authors and Chapters (sub-OP) stored as snapshots. This reviews the annotation → layout translation independently from HTML.
  - LR/OP model builders built only from the store
  - key parser/formatter round-trips (int, string with quotes, UUID, boolean)
  - filter parser (rejects unknown elements)
  - side-effects index
  - `html` escaping (XSS: `<script>` / `"` / `'` in data)
- **Integration** (`packages/cds-htmx/test/integration/`, `cds.test(<repo root>)`):
  - `@htmx` mounts `/htmx/catalog` and `@odata` still works.
  - Full page vs. `HX-Request` fragment.
  - LR columns/labels match LineItem, **including the annotation.xml override**.
  - Dynamic expressions take effect per row/object (hidden field, read-only by FieldControl path, disabled action by OperationAvailable).
  - Filtering, search, sort, growing, count partial.
  - OP sections match Facets.
  - Sub-OP via composition.
  - Draft flow: create → patch (validation error → value state) → save (422 with messages / 200 + toast) → edit → discard; delete.
  - `@restrict` honored (mocked users via `cds.test` auth).
  - **SSE**: open `/$events` with fetch streaming, PATCH `stock`, and assert one message with `<hx-partial>` targeting the `stockStatus` field ids that contains the new value. Call `simulateDelivery` and assert a pushed message on a second client viewing that book.
- **E2E** (`test/e2e/*.spec.ts`, Playwright; if the browser download is blocked, use `channel: 'msedge'` on Windows):
  - LR → filter → OP → sub-OP → browser back.
  - Create/edit/save/discard.
  - Change stock and see the status update without reload (SSE).
  - Two contexts: simulateDelivery in A updates B live.
- **Visual parity** (`test/e2e/parity.spec.ts`):
  - Screenshot FE LR/OP and htmx LR/OP at 1440×900 with the same data and Horizon theme.
  - `pixelmatch` diff images go to `test-results/parity/`, with a soft threshold report (not a hard fail).
  - Skipped automatically if `ui5.sap.com` is unreachable.
- Lint: existing `eslint.config.mjs` (cds recommended) covers the plugin.

## 8. Implementation phases (for Sonnet; each ends green)
0. **Scaffold + spikes**:
   - workspaces, plugin skeleton, protocol registration, asset serving, hello page in Horizon with icons/fonts rendering.
   - spike tests confirming (a) the lean-draft calls in `data/draft.js` via the service API, (b) `<hx-partial>` inside an SSE message with `hx-swap="none"`, (c) `<title>` swap and history restore full-page behavior.
1. **Sample model + annotations + annotation.xml layer** (§6) and the FE reference app. Verify the FE app runs on `/manage-books/webapp/index.html` and shows the XML override.
2. **Annotation pipeline** (§3.1): source, xml, manifest, vocab, store, edm, expressions, registry + coverage, with the golden/coverage/expression unit tests. Then the **layout models** (§3.2, §3.2b) with snapshot tests. No HTML yet. Review the snapshots before continuing.
3. **List Report read-only**: filter bar, table, sort, search, growing, count, navigation.
4. **Object Page display**: header, header facets, anchor bar, sections, table sections, sub-OP, breadcrumbs.
5. **Draft editing**: create/edit/patch/save/discard/delete, value states, messages, footer, value help, fixed values, actions + parameter dialogs, LR draft indicators + Editing Status filter.
6. **SSE + side effects** (§4), including SourceEvents and the live LR row. The channel also records `app`.
7. **App bundles and app-scoped rendering** (design doc §2–3): `lib/apps/*` (`local` + `destination` providers), per-app store/cache keys and annotation layer lists, `X-Htmx-App` / `X-Htmx-Base` handling with validated `basePath`, version-skew trigger, shell-mode fragment-only responses. Also fix `HtmxAdapter.js` calling the non-existent `cache.annotationStoreFor`. Spike: html5-repo runtime URL.
8. **Shell + Work Zone + deployment** (design doc §4–5): `packages/cds-htmx-shell` (standalone + FLP adapters, `hx-csrf`), CSS scoping, versioned assets, sticky-session cookie, `app/manage-books-htmx`, `xs-app.json`, `mta.yaml`, deploy guide. Spike: SSE through `@sap/approuter`.
9. **Frontend extensibility** (design doc §6): fragment templates + sanitizer, building blocks, all FE V4 manifest extension points, `hx-fiori` controller-extension façade + ExtensionAPI, custom page, server extension SPI, coverage entries. Re-verify the parity matrix against the UI5 SDK first.
10. **E2E + visual parity + README** (usage, supported annotations matrix, config options, known deviations from FE), also covering shell mode. Iterate the CSS until the parity diffs are minimal.

## 9. Config (`cds.htmx`, defaults in the plugin package.json)
`theme: "sap_horizon"`, `shell: true`, `appTitle: null` (TypeNamePlural), `growingThreshold: 20`, `assets: "local" | "cdn"`, `sse: { heartbeat: 15000 }`, `liveListReport: true`, `requireHxRequestForMutations: true`.
From Phase 7: `apps: { sources: [{ kind: "local" }], allow: ["*"], ttl: 60000, maxBundleBytes: 2097152, fetchTimeout: 5000 }`, `extensions: []`, `assetsVersioned: true`, `stickySessions: true` (see design doc §9).

## Verification (end-to-end)
1. `npm install` (root, workspaces) → `npm run watch` (`cds watch`).
2. Open `http://localhost:4004/htmx/catalog/Books`. The LR looks like the FE app at `http://localhost:4004/manage-books/webapp/index.html`. Filter, search, sort and "More" work.
3. Click a row → OP. Sections and header match the FE app. Click a chapter → sub-OP with breadcrumb. Browser back/forward works, and reload gives an identical full page.
4. Edit → change Stock to 3 → "Stock Status" turns "Low" (critical) without reload; DevTools shows the `$events` SSE message. Save → toast "Object saved.". Clear Title → Save → error value state + message popover.
5. Open the same book in a second window. Run the `simulateDelivery` action from the first → the second updates live.
6. `npm test` green. `npm run test:e2e` green. Review the parity diffs in `test-results/parity/`.
7. Deployed shell (after Phases 7–8): the app's zip is in the HTML5 repo, Work Zone shows a tile, and the LR/OP load through `xs-app.json` → destination `cap-htmx-srv`. Local annotations come from the app's own `annotation.xml`, and two apps on one service show different layouts. A UI5-wrapper tile and a URL-app tile both work. Intent-based navigation works from the FLP.
8. `GET /htmx/catalog/$coverage` lists every annotation term in the service with its status and has no `unknown` entries. `GET /htmx/catalog/$annotations` matches `/odata/v4/catalog/$metadata`. Edit `annotation.xml` (e.g. reorder columns) → both FE and htmx LR change the same way after reload.
