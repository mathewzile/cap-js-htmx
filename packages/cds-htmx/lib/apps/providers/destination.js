const { config } = require('../../config')
const { AppError } = require('../errors')

/** `{ kind: 'destination', destination, path?, url? }`: reads the app's files over HTTP from where
 *  the frontend is deployed (design doc §3), at `<path><file>` with `{appId}` substituted
 *  (default `/{appId}/`).
 *   - `destination`: a BTP destination resolved through the SAP Cloud SDK (`@sap-cloud-sdk/http-client`,
 *     an optional dependency, required lazily), so authentication is whatever the destination says.
 *   - `url`: a plain base URL fetched directly. For local runs and tests, and for unprotected hosts.
 *  The response is never interpreted as code: callers only get text back. */
module.exports = function destination({ destination: destinationName, path: template = '/{appId}/', url } = {}) {
  if (!destinationName && !url) throw new Error("source 'destination' needs a 'destination' name or a 'url'")

  async function get(requestPath) {
    const { fetchTimeout } = config().apps
    if (url) {
      const res = await fetch(url.replace(/\/+$/, '') + requestPath, { signal: AbortSignal.timeout(fetchTimeout), headers: { Accept: '*/*' } })
      if (res.status === 404) return null
      if (!res.ok) throw new AppError(502, `App source answered ${res.status} for ${requestPath}`)
      return res.text()
    }
    let executeHttpRequest
    try { ({ executeHttpRequest } = require('@sap-cloud-sdk/http-client')) } catch {
      throw new AppError(501, "Source 'destination' needs @sap-cloud-sdk/http-client (npm i @sap-cloud-sdk/http-client)")
    }
    try {
      const res = await executeHttpRequest({ destinationName }, { method: 'GET', url: requestPath, timeout: fetchTimeout, responseType: 'text' })
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    } catch (err) {
      if (err.response?.status === 404) return null
      throw new AppError(502, `App source '${destinationName}' failed for ${requestPath}: ${err.message}`)
    }
  }

  return {
    kind: 'destination',
    volatile: false,
    async resolve(appId) {
      const base = template.replace('{appId}', encodeURIComponent(appId))
      const text = await get(base + 'manifest.json')
      if (text == null) return null
      let manifest
      try { manifest = JSON.parse(text) } catch { throw new AppError(502, `manifest.json of '${appId}' is not valid JSON`) }
      return { manifest, readFile: rel => get(base + rel) }
    }
  }
}
