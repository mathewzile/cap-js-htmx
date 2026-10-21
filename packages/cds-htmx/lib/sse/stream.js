const { config } = require('../config')

function open(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform', // no-transform: proxies (the BTP approuter) must not compress, and so buffer, the stream
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('\n')
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n') } catch { /* client gone */ }
  }, config().sse.heartbeat)
  res.on('close', () => clearInterval(heartbeat))
  return () => clearInterval(heartbeat)
}

/** Writes one SSE message. `data` may be multi-line HTML; each line is sent as its own `data:` field. */
function write(res, { event, data, id } = {}) {
  let msg = ''
  if (id != null) msg += `id: ${id}\n`
  if (event) msg += `event: ${event}\n`
  for (const line of String(data ?? '').split('\n')) msg += `data: ${line}\n`
  msg += '\n'
  res.write(msg)
}

module.exports = { open, write }
