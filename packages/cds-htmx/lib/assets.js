const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { promisify } = require('util')
const express = require('express')

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

function distDirOf(name, sampleFile) {
  return path.dirname(require.resolve(`${name}/${sampleFile}`))
}

const COMPRESSIBLE = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' }
const MIN_BYTES = 1024

/** Static files with `Accept-Encoding` handling (brotli, else gzip). Only this asset router compresses: a
 *  global compression middleware would buffer the SSE stream. The compressed body is made once per file and
 *  modification time and kept in memory (`fundamental-styles.css` is 1.7 MB, 152 KB gzipped). Anything that is
 *  not a text asset, or that the client takes uncompressed, falls through to `express.static`. */
function compressedStatic(dir, { maxAge = 3600 } = {}) {
  const fallback = express.static(dir, { maxAge: maxAge * 1000 })
  const cache = new Map() // `${encoding}:${file}` -> { mtimeMs, body }

  return async function serve(req, res, next) {
    try {
      const type = COMPRESSIBLE[path.extname(req.path)]
      const accept = String(req.headers['accept-encoding'] || '')
      const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
      if (!type || !encoding || (req.method !== 'GET' && req.method !== 'HEAD')) return fallback(req, res, next)

      const file = path.join(dir, decodeURIComponent(req.path))
      if (!file.startsWith(dir + path.sep)) return fallback(req, res, next) // never leave the asset folder
      const stat = await fs.promises.stat(file).catch(() => null)
      if (!stat?.isFile() || stat.size < MIN_BYTES) return fallback(req, res, next)

      const key = `${encoding}:${file}`
      let entry = cache.get(key)
      if (!entry || entry.mtimeMs !== stat.mtimeMs) {
        const source = await fs.promises.readFile(file)
        const body = encoding === 'br'
          ? await brotli(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length } })
          : await gzip(source, { level: 9 })
        cache.set(key, entry = { mtimeMs: stat.mtimeMs, body, etag: `W/"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}-${encoding}"` })
      }

      res.set({ 'Content-Type': type, 'Content-Encoding': encoding, Vary: 'Accept-Encoding', 'Cache-Control': `public, max-age=${maxAge}`, ETag: entry.etag, 'Last-Modified': stat.mtime.toUTCString() })
      if (req.fresh) return res.sendStatus(304)
      res.set('Content-Length', String(entry.body.length))
      res.end(req.method === 'HEAD' ? undefined : entry.body)
    } catch (err) {
      next(err)
    }
  }
}

const mountPath = '/htmx/-'
const router = express.Router()

router.use('/htmx.org', compressedStatic(distDirOf('htmx.org', 'dist/htmx.min.js')))
router.use('/fundamental-styles', compressedStatic(distDirOf('fundamental-styles', 'dist/fundamental-styles.css')))
router.use('/common-css', compressedStatic(distDirOf('@fundamental-styles/common-css', 'dist/common-css.css')))
router.use('/theming-base-content', compressedStatic(path.dirname(require.resolve('@sap-theming/theming-base-content/package.json'))))
// our own files change while developing: revalidate (ETag) on every load instead of caching for an hour
router.use('/public', compressedStatic(path.join(__dirname, '..', 'public'), { maxAge: 0 }))

module.exports = { mountPath, router, distDirOf, compressedStatic }
