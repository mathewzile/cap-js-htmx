/* Standalone adapter: the app is the whole page (`index.html`, or a Work Zone "URL app"). The route lives in the hash:
 * `index.html#/htmx/catalog/Books(ID=...)`, so a reload or a pasted link opens the same page and Back/Forward walk through it. */
;(function (global) {
  'use strict'

  function decode(text) { try { return decodeURI(text) } catch { return text } }

  global.HtmxShellAdapters = global.HtmxShellAdapters || {}
  global.HtmxShellAdapters.standalone = function standalone() {
    return {
      name: 'standalone',
      attach({ onRoute }) { global.addEventListener('hashchange', () => onRoute(this.current())) },
      current() { return decode(global.location.hash.replace(/^#/, '')) || null },
      push(route) { global.location.hash = '#' + route },
      replace(route) { global.history.replaceState(history.state, '', '#' + route) },
      theme() { return null },
      onTheme() {},
      setTitle() {}
    }
  }
})(window)
