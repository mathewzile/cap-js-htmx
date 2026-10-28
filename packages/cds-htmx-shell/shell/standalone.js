/* Standalone adapter: the app is the whole page (`index.html`, or a Work Zone "URL app"). The route lives in the hash:
 * `index.html#/Books(ID=...)` (nothing for the entry page), so a reload or a pasted link opens the same page and Back/Forward walk through it. */
;(function (global) {
  'use strict'

  function decode(text) { try { return decodeURI(text) } catch { return text } }
  const url = route => global.location.pathname + global.location.search + (route ? '#' + route : '')

  global.HtmxShellAdapters = global.HtmxShellAdapters || {}
  global.HtmxShellAdapters.standalone = function standalone() {
    return {
      name: 'standalone',
      attach({ onRoute }) { this.listener = () => onRoute(this.current()); global.addEventListener('hashchange', this.listener) },
      detach() { global.removeEventListener('hashchange', this.listener) },
      current() { return decode(global.location.hash.replace(/^#/, '')) || null },
      // an empty route (the entry page) leaves no `#` behind
      push(route) { if (route) global.location.hash = '#' + route; else global.history.pushState(null, '', url('')) },
      replace(route) { global.history.replaceState(history.state, '', url(route)) },
      theme() { return null },
      onTheme() {},
      setTitle() {}
    }
  }
})(window)
