# cap-js-htmx

A CAP plugin (`cds-htmx`) that serves SAP Fiori elements style **List Report** and **Object Page** UIs over **htmx 4**. The server renders HTML from the compiled OData annotations (and the annotations and manifest of an app); the browser swaps the fragments in. No UI framework in the browser, no UI code in the app.

![List Report](docs/images/phase8-list-report.png)

## Quick start

```sh
npm install
npm run watch
```

- `http://localhost:4004/htmx/catalog/Books`: List Report rendered from the service annotations
- `http://localhost:4004/manage-books/webapp/index.html`: the Fiori elements app, to compare
- `http://localhost:4004/manage-books-htmx/webapp/index.html`: the same app on the htmx shell
- `http://localhost:4004/manage-authors-htmx/webapp/index.html`: flexible column layout
- `http://localhost:4004/htmx/catalog/$coverage`: annotation coverage of the service

## Layout

| Folder | Content |
|---|---|
| `packages/cds-htmx` | the plugin: protocol, annotation pipeline, layout models, rendering, side effects over SSE |
| `packages/cds-htmx-shell` | the small browser shell (standalone and SAP Work Zone adapters) |
| `app/` | sample apps: Fiori elements apps and their htmx counterparts |
| `srv/`, `db/` | the sample CAP service and data model |
| `docs/` | documentation |

## Documentation

[Getting started](docs/index.md) · [Architecture](docs/ARCHITECTURE.md) · [Supported annotations](docs/annotations.md) · [Configuration](docs/configuration.md) · [Deploying to BTP](docs/DEPLOY_BTP.md) · [Known deviations from Fiori elements](docs/deviations.md) · [Open items and roadmap](docs/OPEN_ITEMS_AND_ROADMAP.md)

The same pages are published as a GitHub Pages site from `docs/` on every push to `main`.

## Tests

```sh
npm test            # unit and integration tests
npm run test:e2e    # browser tests (Playwright), light and dark theme, including the Fiori elements parity checks (fe-parity.spec.js)
```

## Known deviations

The pages follow Fiori elements V4. Share and Related Apps, the analytical list page and sticky sessions are not planned; tree tables are display-only; personalization is browser-local. The full list is in [docs/deviations.md](docs/deviations.md).
