const fs = require('node:fs')
const path = require('node:path')
const cds = require('@sap/cds')

/** Development only: the welcome page of `cds serve` (`/`), as the htmx apps need it.
 *
 *  1. Web Apps. `@sap/cds` renders one template item (`<li><a href="${href}">${label}</a></li>`) into the list and its page script
 *     repeats the whole content of the list for every entry of `document.app_info.webapps`. `cds-plugin-ui5` rewrites that list
 *     for a cds that rendered one item per app: it keeps the items whose link text names a folder of `app/`, which the template
 *     never does, and adds its own links. What is left is only its links, repeated for every web app, and no htmx app.
 *     The rewritten page is set right: the template is back in the list, the links of the plugin are a list of their own behind it,
 *     and the apps with a `ui5.yaml` (the plugin serves those, with its links) are not listed a second time.
 *  2. "Fiori preview" of a service with an htmx endpoint is one for each protocol (`@sap/cds-fiori` only knows OData, and cds shows
 *     the link of an OData endpoint for every protocol): the htmx one opens the entity's List Report of the htmx endpoint. */

const TEMPLATE = '<li><a href="${href}" target="_blank">${label}</a></li>'
const UI5_ITEM = /<li>\s*<a class="ui5"[\s\S]*?<\/li>/g

/** The folders of `app/` the UI5 tooling serves (they have a `ui5.yaml`). */
function ui5Folders() {
  const dir = path.resolve(cds.root, cds.env.folders.app)
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(f => f.isDirectory() && fs.readdirSync(path.join(dir, f.name)).some(name => /^ui5.*\.yaml$/.test(name)))
      .map(f => f.name)
  } catch { return [] }
}

/** The page after `cds-plugin-ui5` has rewritten it, or the page as it is when there is nothing to put right. */
function fixWebApps(html) {
  const section = /(<section id="webapps">[\s\S]*?<ul>)([\s\S]*?)(<\/ul>)/.exec(html)
  if (!section) return html
  const ui5Items = section[2].match(UI5_ITEM) || []
  const rest = section[2].replace(UI5_ITEM, '').trim()
  if (!ui5Items.length && rest.includes('${href}')) return html
  const list = rest.includes('${href}') ? rest : `${TEMPLATE}${rest}`
  const second = ui5Items.length ? `\n    <ul>${ui5Items.join('\n')}</ul>` : ''
  html = html.replace(section[0], () => `${section[1]}${list}${section[3]}${second}`)

  const folders = ui5Folders()
  return html.replace(/(document\.app_info = )(\{[\s\S]*?\})( <\/script>)/, (all, before, json, after) => {
    try {
      const info = JSON.parse(json)
      info.webapps = (info.webapps || []).filter(app => !folders.includes(app.href.split('/')[1]))
      return before + JSON.stringify(info) + after
    } catch { return all }
  })
}

function mountWelcomePage(app) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/') return next()
    // the end of the response that `cds-plugin-ui5` wraps afterwards calls this one, with the page it has rewritten
    const end = res.end
    res.end = function (chunk, ...args) {
      const type = String(res.getHeader('content-type') || '')
      if (res.statusCode === 200 && /html/.test(type) && chunk != null && typeof chunk !== 'function') {
        const html = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        const fixed = fixWebApps(html)
        if (fixed !== html) {
          if (!res.headersSent) res.removeHeader('content-length')
          chunk = fixed
          args = args.filter(arg => typeof arg === 'function')
        }
      }
      return end.call(this, chunk, ...args)
    }
    next()
  })
  // first in the stack, so that the plugin, which puts its middleware before the static files, wraps the end of the response after us
  const stack = (app._router ?? app.router)?.stack
  if (Array.isArray(stack)) stack.unshift(stack.pop())
}

/** After `@sap/cds-fiori` has put its link provider on the services (the page asks the providers when it is requested). */
function previewForHtmx() {
  for (const srv of cds.service.providers) {
    const htmx = srv.endpoints?.find(e => e.kind === 'htmx')
    const odata = srv.endpoints?.find(e => e.kind.startsWith('odata'))
    if (!htmx || !odata || !srv.$linkProviders) continue
    srv.$linkProviders = srv.$linkProviders.map(provider => {
      let probe
      try { probe = provider('Probe', odata) } catch { return provider }
      if (![].concat(probe ?? []).some(link => /^\/\$fiori-preview\//.test(link?.href))) return provider
      return (entity, endpoint) => {
        if (!entity || endpoint?.kind !== 'htmx') return // asked for the htmx endpoint, it answers for both
        const link = provider(entity, odata)
        return [
          ...[].concat(link ?? []).map(l => ({ ...l, protocols: ['odata'] })),
          { href: `${endpoint.path}/${entity}`, title: 'Preview in htmx', name: 'Fiori preview', protocols: ['htmx'] }
        ]
      }
    })
  }
}

module.exports = { mountWelcomePage, previewForHtmx, fixWebApps }
