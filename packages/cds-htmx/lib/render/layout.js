const { html, raw } = require('./html')
const { config } = require('../config')

function headAssets(theme) {
  return html`
    <link rel="stylesheet" href="/htmx/-/theming-base-content/content/Base/baseLib/${theme}/css_variables.css">
    <link rel="stylesheet" href="/htmx/-/fundamental-styles/theming/${theme}.css">
    <link rel="stylesheet" href="/htmx/-/common-css/common-css.css">
    <link rel="stylesheet" href="/htmx/-/fundamental-styles/fundamental-styles.css">
    <link rel="stylesheet" href="/htmx/-/public/htmx-fiori.css">
    <script src="/htmx/-/htmx.org/htmx.min.js"></script>
    <script src="/htmx/-/htmx.org/ext/hx-sse.min.js"></script>
    <script src="/htmx/-/public/htmx-fiori.js" defer></script>
  `
}

/** Renders the full HTML document shell around a page fragment. */
function page({ title, clientId, basePath, body }) {
  const { theme } = config()
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="htmx-config" content='{"extensions":"sse"}'>
  ${headAssets(theme)}
</head>
<body class="htmx-fiori is-compact"${clientId ? raw(` hx-headers:inherited='{"X-Htmx-Client":"${clientId}"}'`) : ''}>
  <div id="shell"></div>
  <div id="app" hx-target:inherited="#app" hx-swap:inherited="innerHTML show:window:top" hx-push-url:inherited="true">${raw(body)}</div>
  <div id="messages"></div>
  <div id="toast"></div>
  <div id="dialogs"></div>
  ${clientId ? raw(`<div id="sse" hx-sse:connect="${basePath}/$events?client=${clientId}" hx-swap="none"></div>`) : ''}
</body>
</html>`
}

/** Renders just a fragment (for HX-Request partial swaps) with a <title> update. */
function fragment({ title, body }) {
  return html`<title>${title}</title>${raw(body)}`
}

module.exports = { page, fragment, headAssets }
