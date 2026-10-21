/* hx-csrf: the CSRF token of the approuter for every write.
 *
 * The approuter (and the CAP server behind it) refuse POST, PUT, PATCH and DELETE without the `X-CSRF-Token` of the session. The
 * token is fetched once with `X-CSRF-Token: Fetch` from a GET route (the service's `$shell`), attached to every write, and fetched
 * again -- once, then the write is repeated -- when a write is answered `403` with `x-csrf-token: Required` (the session
 * changed, the token expired). Without an approuter (local development) the fetch yields no token and nothing is added.
 *
 *   HtmxCsrf.install({ url: '/app/htmx/catalog/$shell', headers: { 'X-Htmx-Base': '/app' } })
 */
;(function (global) {
  'use strict'

  const SAFE = /^(GET|HEAD|OPTIONS)$/i

  function install({ url, headers = {} }) {
    let token
    let pending

    function fetchToken() {
      pending ||= fetch(url, { method: 'GET', credentials: 'same-origin', headers: { ...headers, 'X-CSRF-Token': 'Fetch', 'HX-Request': 'true' } })
        .then(res => { const value = res.headers.get('x-csrf-token'); token = value && value.toLowerCase() !== 'required' ? value : undefined })
        .catch(() => { token = undefined })
        .finally(() => { pending = undefined })
      return pending
    }

    const withToken = init => {
      if (!token) return init
      const next = { ...init }
      if (typeof Headers !== 'undefined' && init.headers instanceof Headers) { next.headers = new Headers(init.headers); next.headers.set('X-CSRF-Token', token) }
      else next.headers = { ...init.headers, 'X-CSRF-Token': token }
      return next
    }

    document.addEventListener('htmx:config:request', e => {
      const ctx = e.detail?.ctx
      const request = ctx?.request
      if (!request || SAFE.test(request.method || 'GET')) return
      const send = ctx.fetch ?? global.fetch.bind(global)
      ctx.fetch = async (target, init) => {
        if (!token) await (pending || fetchToken())
        let res = await send(target, withToken(init))
        if (res.status === 403 && res.headers.get('x-csrf-token')?.toLowerCase() === 'required') {
          token = undefined
          await fetchToken()
          if (token) res = await send(target, withToken(init)) // the write never reached the backend: safe to repeat once
        }
        return res
      }
    })

    return { refresh: fetchToken, get token() { return token } }
  }

  global.HtmxCsrf = { install }
})(window)
