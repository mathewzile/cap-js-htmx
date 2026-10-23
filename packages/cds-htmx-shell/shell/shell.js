/* cds-htmx-shell: starts a cds-htmx app in a page it does not own.
 *
 *   HtmxShell.start({
 *     root,                                   // element to render into (gets the plugin's `htmx-fiori hf-root` classes)
 *     base: '/cap.managebooks-1.0.0',         // URL prefix of the HTML5 app ('' when served from the origin's root)
 *     app: 'managebooks.htmx@1.0.0',          // sent as X-Htmx-App: which manifest/annotations the backend lays pages out from
 *     service: '/htmx/catalog',               // the @htmx service, relative to `base`
 *     entry: '/htmx/catalog/Books',           // first page when the URL carries no route
 *     adapter,                                // HtmxShellAdapters.standalone() | .flp(ui5)
 *     csrf: true
 *   })
 *
 * Everything the backend sends is HTML for `#app`. The shell only supplies what a rendered page would have supplied itself: the
 * request headers, the (versioned) assets, the texts, the event stream address, and the route <-> URL/hash mapping.
 */
;(function (global) {
  'use strict'

  const loadedScripts = new Set()

  function loadStyle(href, id) {
    return new Promise(resolve => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      if (id) link.id = id
      link.onload = link.onerror = resolve // a missing theme file must not stop the page
      document.head.append(link)
    })
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = false
      script.onload = () => { loadedScripts.add(src); resolve() }
      script.onerror = () => reject(new Error('Could not load ' + src))
      document.head.append(script)
    })
  }

  const clientId = () => (global.crypto?.randomUUID ? global.crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36))

  function fail(root, message) {
    root.innerHTML = ''
    const strip = document.createElement('div')
    strip.className = 'fd-message-strip fd-message-strip--error'
    strip.setAttribute('role', 'alert')
    strip.innerHTML = '<div class="fd-message-strip__content"><div class="fd-message-strip__text"></div></div>'
    strip.querySelector('.fd-message-strip__text').textContent = message
    root.append(strip)
  }

  const MOTION_RANK = { full: 0, fast: 1, none: 2 }

  /** The motion of the page from the app's setting (`full` | `fast` | `none`; booleans are the old form) and UI5's animation mode
   *  (`full`, `basic`, `minimal`, `none`; the launchpad's, when there is one): the calmer of the two. `basic` and `minimal` keep
   *  motion but shorter, so they are `fast`. */
  function motionFor(app, ui5Mode) {
    const fromApp = app === false || app === 'none' ? 'none' : app === 'fast' ? 'fast' : 'full'
    const fromUi5 = ui5Mode === 'none' ? 'none' : ui5Mode === 'basic' || ui5Mode === 'minimal' ? 'fast' : 'full'
    return MOTION_RANK[fromApp] >= MOTION_RANK[fromUi5] ? fromApp : fromUi5
  }

  async function start(options) {
    const { root, base = '', app, service, entry, adapter, csrf = true } = options
    const language = options.language || navigator.language || 'en'
    const id = clientId()
    const headers = { 'X-Htmx-Base': base, 'X-Htmx-App': app, 'Accept-Language': language }
    const shellUrl = `${base}${service}/$shell`

    let info
    try {
      const res = await fetch(shellUrl, { headers, credentials: 'same-origin' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      info = await res.json()
    } catch (err) {
      fail(root, `The app could not be started (${err.message}).`)
      throw err
    }

    // the container: the same elements a page rendered by the plugin has
    root.classList.add('htmx-fiori', 'hf-root', 'is-compact')
    // motion: the app's (sap.htmx.animations, from $shell) and, in the launchpad, UI5's animation mode; the calmer of the two applies
    const applyMotion = () => {
      const mode = motionFor(info.animations, adapter.animationMode?.())
      root.classList.toggle('hf-no-motion', mode === 'none')
      root.classList.toggle('hf-motion-fast', mode === 'fast')
    }
    applyMotion()
    adapter.onAnimationMode?.(applyMotion)
    root.setAttribute('hx-headers:inherited', JSON.stringify({ ...headers, 'X-Htmx-Client': id }))
    root.innerHTML = '<div id="shell"></div><div id="app"></div><div id="messages"></div><div id="toast"></div><div id="dialogs"></div>'
    const texts = document.createElement('script')
    texts.type = 'application/json'
    texts.id = 'hf-texts'
    texts.textContent = JSON.stringify(info.texts).replace(/</g, '\\u003c')
    const stream = document.createElement('script')
    stream.type = 'application/json'
    stream.id = 'hf-sse'
    stream.textContent = JSON.stringify({ url: `${shellUrl.replace(/\/\$shell$/, '')}/$events?client=${id}&app=${encodeURIComponent(app)}` })
    root.append(texts, stream)

    // assets, at the versioned address the backend named. In the launchpad UI5 already defines the --sap* variables, and the
    // theme follows UI5's.
    // The launchpad's theme is the user's setting (UI5 reports sap_horizon, sap_horizon_dark, the high contrast ones, or an older theme,
    // which maps to the Horizon one of the same kind); outside the launchpad a configured theme wins and `auto` follows the browser.
    const horizonFor = name => !name ? null : info.themes[name] ? name : /hcb/.test(name) ? 'sap_horizon_hcb' : /hcw/.test(name) ? 'sap_horizon_hcw' : /dark/.test(name) ? 'sap_horizon_dark' : 'sap_horizon'
    const dark = global.matchMedia?.('(prefers-color-scheme: dark)')
    const preferred = () => adapter.name !== 'flp' && info.auto ? (dark?.matches ? 'sap_horizon_dark' : 'sap_horizon') : null
    const theme = horizonFor(adapter.theme()) || preferred() || info.theme
    const styles = []
    if (adapter.name !== 'flp') styles.push(loadStyle(info.variables?.[theme] || info.styles.variables, 'hf-variables'))
    styles.push(loadStyle(info.themes[theme], 'hf-theme'), loadStyle(info.styles.common), loadStyle(info.styles.fundamental), ...info.styles.own.map(href => loadStyle(href)))
    await Promise.all(styles)
    const applyTheme = name => {
      const horizon = horizonFor(name)
      if (!horizon) return
      document.getElementById('hf-theme').href = info.themes[horizon]
      const variables = document.getElementById('hf-variables')
      if (variables && info.variables?.[horizon]) variables.href = info.variables[horizon]
    }
    adapter.onTheme(applyTheme)
    if (adapter.name !== 'flp' && info.auto) dark?.addEventListener?.('change', () => applyTheme(preferred()))

    if (!global.htmx) {
      const meta = document.createElement('meta')
      meta.name = 'htmx-config'
      meta.content = JSON.stringify({ extensions: 'sse' })
      document.head.append(meta)
      await loadScript(info.scripts.htmx)
    }
    await loadScript(info.scripts.sse)
    if (csrf && global.HtmxCsrf) global.HtmxCsrf.install({ url: shellUrl, headers })
    for (const src of info.scripts.own) await loadScript(src)
    global.htmx.process(root)

    // routes: the URL/hash holds the path below `base`. htmx still decides what is a push and what a replace (hx-push-url, HX-Push-Url,
    // HX-Replace-Url) but its history entries are cancelled and handed to the adapter; restoring a page is the adapter's hash event.
    document.addEventListener('htmx:before:history:restore', e => e.preventDefault())
    const appElement = document.getElementById('app')
    let current = null
    const toRoute = path => (path.startsWith(base) ? path.slice(base.length) : path)
    const show = route => {
      current = route
      return global.htmx.ajax('GET', base + route, { source: appElement, target: '#app', swap: 'innerHTML' })
    }
    document.addEventListener('htmx:before:history:update', e => {
      const { type, path } = e.detail.history
      e.preventDefault()
      const route = toRoute(path)
      current = route
      if (type === 'push') adapter.push(route); else adapter.replace(route)
    })
    // The launchpad hands the route back through its hash, which may encode it (`(`, `=`, `,` in a key): the hash event of our own push
    // is the same route, not a navigation, and a real one (back, forward) is fetched in the form the server knows.
    const decoded = route => { try { return decodeURIComponent(route) } catch { return route } }
    adapter.attach({ onRoute: route => { if (route && route !== current && decoded(route) !== decoded(current ?? '')) show(decoded(route)) } })
    document.addEventListener('htmx:after:swap', e => {
      if (!root.contains(e.target)) return
      adapter.setTitle(document.title)
    })

    // a first visit without a route gets the entry page's route, so a reload or a copied link opens the same page
    const first = adapter.current()
    await show(first || entry)
    if (!first) adapter.replace(entry)
    document.dispatchEvent(new CustomEvent('hf:ready'))
    return { info, clientId: id, show, destroy() { document.getElementById('sse')?.remove(); root.replaceChildren() } }
  }

  global.HtmxShell = { start, motionFor }
})(window)
