const { html, raw } = require('./html')
const { config } = require('../config')
const { asScriptJson } = require('./texts')
const assets = require('../assets')

function headAssets(theme, base = '') {
  const { styles, scripts } = assets.urls(base)
  return html`
    <link rel="stylesheet" href="${styles.variables(theme)}">
    <link rel="stylesheet" href="${styles.theme(theme)}">
    <link rel="stylesheet" href="${styles.common}">
    <link rel="stylesheet" href="${styles.fundamental}">
    <link rel="stylesheet" href="${styles.own[0]}">
    <link rel="stylesheet" href="${styles.own[1]}">
    <script src="${scripts.htmx}"></script>
    <script src="${scripts.sse}"></script>
    <script src="${scripts.own[0]}" defer></script>
    <script src="${scripts.own[1]}" defer></script>
  `
}

/** Renders the full HTML document shell around a page fragment. */
function page({ title, clientId, basePath, assetBase = '', body, texts = {} }) {
  const { theme } = config()
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="htmx-config" content='{"extensions":"sse"}'>
  ${headAssets(theme, assetBase)}
</head>
<body class="htmx-fiori is-compact"${clientId ? raw(` hx-headers:inherited='{"X-Htmx-Client":"${clientId}"}'`) : ''}>
  <div id="shell"></div>
  <div id="app">${raw(body)}</div>
  <div id="messages"></div>
  <div id="toast"></div>
  <div id="dialogs"></div>
  <script type="application/json" id="hf-texts">${raw(asScriptJson(texts))}</script>
  ${clientId ? raw(`<script type="application/json" id="hf-sse">${JSON.stringify({ url: `${basePath}/$events?client=${clientId}` })}</script>`) : ''}
</body>
</html>`
}

/** Renders just a fragment (for HX-Request partial swaps) with a <title> update. */
function fragment({ title, body }) {
  return html`<title>${title}</title>${raw(body)}`
}

module.exports = { page, fragment, headAssets }
