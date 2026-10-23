# Deploying cap-htmx to SAP BTP (Cloud Foundry, SAP Build Work Zone)

`cap-htmx_1.0.0.mtar` (repo root, built from `mta.yaml`) deploys

| Module | What it is | Runs as |
|---|---|---|
| `cap-htmx-srv` | CAP service: OData under `/odata`, the htmx UI under `/htmx`, plus the app manifests it lays pages out from | Node.js app, 512 MB, 1 instance |
| `cap-htmx-db-deployer` | HANA tables, views and the CSV sample data (1,005 books) | one-off task app |
| `cap-htmx-app-content` | uploads the HTML5 app `managebooks.htmx` (manifest, annotations, generic htmx shell, `xs-app.json`) to the HTML5 Application Repository | one-off content deployer |
| `cap-htmx-destination-content` | creates the destination `cap-htmx-srv` = URL of `cap-htmx-srv`, with `HTML5.ForwardAuthToken` | one-off content deployer |

How the pieces talk to each other is in the architecture page; in short: Work Zone tile → managed approuter → `xs-app.json` route `^/htmx/(.*)$` → destination `cap-htmx-srv` → CAP.

## 1. Entitlements

Add these to the **subaccount** (BTP cockpit → Entitlements) before deploying. A service marked *subscription* is subscribed in Service Marketplace, the others are service instances created by the deployment.

| Service (technical name) | Plan | Quota | Used for |
|---|---|---|---|
| SAP HANA Cloud (`hana-cloud`) | `hana` | 1 instance (smallest size is enough) | the database. Create the instance once (BTP cockpit → SAP HANA Cloud) and **map it to the Cloud Foundry space** (instance mapping) or the HDI container cannot be created |
| SAP HANA Schemas & HDI Containers (`hana`) | `hdi-shared` | 1 | `cap-htmx-db` container, created by the deployment |
| Authorization and Trust Management Service (`xsuaa`) | `application` | 1 | `cap-htmx-auth`: validates the user's token in CAP |
| Destination Service (`destination`) | `lite` | 1 | `cap-htmx-destination`: how the approuter finds the CAP service |
| HTML5 Application Repository Service (`html5-apps-repo`) | `app-host` | 1 | `cap-htmx-repo-host`: stores the HTML5 app |
| SAP Build Work Zone, standard edition (`SAPLaunchpad`) | `standard` (*subscription*) | 1 | launchpad, content management and the managed approuter that serves the HTML5 app |
| Cloud Foundry Runtime (`APPLICATION_RUNTIME`) | `MEMORY` | at least 1 GB free in the space | srv 512 MB, and the three deployer apps briefly (256 MB each, parallel deployment) |

Roles you need: *Space Developer* in the target space, *Subaccount Administrator* (or equivalent) to subscribe Work Zone, and the role collection `Launchpad_Admin` to maintain Work Zone content.

If you use Cloud Identity Services (IAS) instead of the default identity provider nothing in this project changes; the approuter takes the user from the subaccount's trust configuration.

## 2. Deploy

```bash
cf install-plugin multiapps        # once
cf login -a https://api.cf.<region>.hana.ondemand.com
cf target -o <org> -s <space>
cf deploy cap-htmx_1.0.0.mtar
```

Rebuild it from the repo (needs Node 22+, the Cloud MTA Build Tool `mbt`, and network access to npm):

```bash
npm i -g mbt            # once
mbt build -t ./ --mtar cap-htmx_1.0.0.mtar      # same as: npm run build:mta
```

The build runs `npm ci`, builds the HTML5 zips (`app/manage-books-htmx`, and `app/manage-authors-htmx`, the same shell with a Flexible Column Layout), `cds build --production`, and `scripts/prepare-srv.mjs`, which packs the `cds-htmx` workspace package into `gen/srv/vendor` (it is not on a registry) and copies the app manifests and annotation files the plugin reads at run time.

## 3. Make the app appear in Work Zone

1. Work Zone → **Channel Manager** → *HTML5 Apps* → refresh. The app **Manage Books (htmx)** (`sap.app.id` `managebooks.htmx`, `sap.cloud.service` `cap.htmx`) is listed.
2. **Content Manager** → *Content Explorer* → *HTML5 Apps* → add **Manage Books (htmx)** to *My Content*.
3. Create a **Role** and a **Group**, add the app to both, add the role to your site (*Site Directory*).
4. Open the site. The tile starts the app: `/htmx/catalog/Books` is requested through the approuter.

The app's inbound is `Books-manageHtmx`. Its first page and service come from `sap.htmx` in `app/manage-books-htmx/webapp/manifest.json`. The authors app's inbound is `Authors-manageHtmx` (`app/manage-authors-htmx/webapp/manifest.json`); its manifest declares the `sap.f` router and three routes, which is what opens List Report, Author and Book in columns.

The theme follows the Work Zone user's setting (Settings > Appearance): the shell asks the launchpad's UI5 for the theme and updates when it changes. Standalone, `cds.htmx.theme` (`sap_horizon`, `sap_horizon_dark`, `sap_horizon_hcb`, `sap_horizon_hcw`, or `auto` for the browser's preference) decides.

How much the page moves is `"animations"` in the `sap.htmx` block of the app's manifest: `"full"` (default), `"fast"` (every transition 75% shorter) or `"none"` (no transitions or animations; `true` / `false` also work). In the launchpad the user's animation mode (UI5's `animationMode`) applies as well, and the calmer of the two wins. This setting, like the column layout, belongs to the app: it applies to the pages of that app, not to the standalone pages of the service.

## 4. After the first deployment: check these

Everything below was tested locally against a real `@sap/approuter`, but not on a landscape.

| Check | How | If it fails |
|---|---|---|
| Service is up | `cf app cap-htmx-srv`, `cf logs cap-htmx-srv --recent` | HANA instance not mapped to the space, or `hdi-shared` entitlement missing |
| Data deployed | the list shows *Books (1,005)* | `cf logs cap-htmx-db-deployer --recent` |
| Writes (Create, Edit, Save) work | edit a book and save | CSRF: the approuter answers `403` with header `x-csrf-token: Required`. The shell (`hx-csrf.js`) fetches a token from `/htmx/catalog/$shell` and retries once; if that does not help, look at the `xs-app.json` route (`csrfProtection`) |
| Live updates | open a book in two browser tabs, change the stock in one: the other updates | open DevTools → Network: `$events` must stay open and show a `:` ping every 15 s. Buffered or no events means a proxy compresses the stream (the service sends `Cache-Control: no-transform` to prevent it) |
| Browser Back/Forward and reload | open a book, press Back, reload | the route is the launchpad's inner-app hash; if it is lost, check that the app runs in-place (not in an iframe of another origin) |
| More than one instance | raise `instances` in `mta.yaml`, repeat the live-update check with two tabs | keep `instances: 1` |

## 5. What is not verified, and what is not there

- **Not run on BTP.** Verified locally: the HTML5 app behind a real `@sap/approuter` 23.3.0 (prefix, hash routing, deep links, SSE, versioned assets), the CSRF client against a stand-in for the approuter's token handling, and the `srv` module unpacked and started from the MTAR. The FLP adapter (hash/URL prefix, theme sync, `ShellUIService` title, animation mode) is verified in a real launchpad. Not verified: XSUAA token validation in CAP, and SAP HANA (the service ran on SQLite here).
- **`html5-repo` app source.** The backend reads the app's manifest and annotations from its own copy in `gen/srv/app` (the `local` source). That copy and the HTML5 zip come from the same build. Pulling them from the HTML5 repository at run time (`destination`/`html5-repo` sources) is available but not used here.
- **No scopes yet.** `xs-security.json` defines none; any authenticated user may use the app. Add scopes and role templates when services get `@requires`.
- **Intent-based navigation links** (`DataFieldWithIntentBasedNavigation`) are still rendered disabled.
- **Draft locks.** Drafts live in HANA, so they survive restarts. The "locked by" name of another user is not shown (as before).
