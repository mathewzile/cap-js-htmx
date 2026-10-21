/** The test client talks like a browser running htmx: writes carry `HX-Request` (the plugin refuses writes without it,
 *  `requireHxRequestForMutations`). Reads stay plain so a test decides itself between a full page and a fragment.
 *  The server (and so the axios instance) only exists once the tests run, so the instance is wrapped on first use. */
module.exports = api => {
  let installed = false
  return new Proxy(api, {
    get(target, prop) {
      if (!installed && target.axios) {
        installed = true
        const axios = target.axios
        const request = axios.request.bind(axios)
        axios.request = config => request(/^(get|head|options)$/i.test(config.method || 'get') ? config : { ...config, headers: { ...config.headers, 'HX-Request': 'true' } })
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}
