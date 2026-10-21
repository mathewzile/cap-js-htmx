// SSE playground client: connects as its own SSE client and prints every raw message.
;(() => {
  const log = document.getElementById('playground-log')
  if (!log) return
  const clientId = 'playground-' + Math.random().toString(16).slice(2, 10)
  const source = new EventSource(`${log.dataset.events}?client=${clientId}`)
  const stamp = () => new Date().toLocaleTimeString()
  const add = (label, data) => {
    log.textContent += `[${stamp()}] ${label}\n${data ? data.replace(/^/gm, '    ') + '\n' : ''}`
    log.scrollTop = log.scrollHeight
  }
  add('connecting…')
  source.onopen = () => {
    add('connected as ' + clientId)
    // act as a List Report of one set, so live row pushes reach this log as well
    if (log.dataset.watch) {
      fetch(log.dataset.watchUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HX-Request': 'true' }, body: new URLSearchParams({ client: clientId, set: log.dataset.watch }) })
        .then(r => add(r.ok ? `watching ${log.dataset.watch} (List Report)` : 'could not register a view'))
    }
  }
  source.onerror = () => add('connection lost (the browser retries)')
  source.onmessage = e => add('message (swapped by hx-sse as HTML)', e.data)
  // named events are not delivered to onmessage; listen for the ones the plugin sends
  for (const name of ['connected', 'htmx:fe:sideEffects']) source.addEventListener(name, e => add(`event: ${name}`, e.data))
  window.addEventListener('beforeunload', () => source.close())
})()
