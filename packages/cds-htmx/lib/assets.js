const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')
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
function compressedStatic(dir, { maxAge = 3600, immutable = false } = {}) {
  const fallback = express.static(dir, { maxAge: maxAge * 1000, immutable })
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

      res.set({ 'Content-Type': type, 'Content-Encoding': encoding, Vary: 'Accept-Encoding', 'Cache-Control': `public, max-age=${maxAge}${immutable ? ", immutable" : ""}`, ETag: entry.etag, 'Last-Modified': stat.mtime.toUTCString() })
      if (req.fresh) return res.sendStatus(304)
      res.set('Content-Length', String(entry.body.length))
      res.end(req.method === 'HEAD' ? undefined : entry.body)
    } catch (err) {
      next(err)
    }
  }
}

const mountPath = '/htmx/-'

/** The asset version: changes whenever any file served below changes (the plugin's own files, htmx, the style
 *  libraries). Pages and the shell address assets as `/htmx/-/v<version>/...`, which can be cached forever; a new
 *  deployment therefore never mixes old CSS with new HTML. */
/** The version of an installed package, read from its folder (a package's `exports` may hide its package.json). */
function packageVersion(name, sampleFile) {
  let dir = distDirOf(name, sampleFile)
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir)
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
}

function computeVersion() {
  const hash = crypto.createHash('sha1')
  for (const [pkg, sample] of [['htmx.org', 'dist/htmx.min.js'], ['fundamental-styles', 'dist/fundamental-styles.css'], ['@fundamental-styles/common-css', 'dist/common-css.css'], ['@sap-theming/theming-base-content', 'package.json']]) {
    hash.update(`${pkg}@${packageVersion(pkg, sample)};`)
  }
  hash.update(`cds-htmx@${require('../package.json').version};`)
  const publicDir = path.join(__dirname, '..', 'public')
  for (const file of fs.readdirSync(publicDir).sort()) hash.update(`${file}:`).update(fs.readFileSync(path.join(publicDir, file)))
  return hash.digest('hex').slice(0, 10)
}
const version = computeVersion()

function assetRouter({ maxAge, publicMaxAge, immutable }) {
  const opts = { maxAge, immutable }
  const router = express.Router()
  router.use('/htmx.org', compressedStatic(distDirOf('htmx.org', 'dist/htmx.min.js'), opts))
  router.use('/fundamental-styles', compressedStatic(distDirOf('fundamental-styles', 'dist/fundamental-styles.css'), opts))
  router.use('/common-css', compressedStatic(distDirOf('@fundamental-styles/common-css', 'dist/common-css.css'), opts))
  router.use('/theming-base-content', compressedStatic(path.dirname(require.resolve('@sap-theming/theming-base-content/package.json')), opts))
  router.use('/public', compressedStatic(path.join(__dirname, '..', 'public'), { maxAge: publicMaxAge, immutable }))
  return router
}

const router = express.Router()
// `/v<version>/...`: content-addressed, cached for a year. The unversioned path stays for the playground and old links;
// our own files there are revalidated (ETag) on every load while developing.
router.use(`/v${version}`, assetRouter({ maxAge: 31536000, publicMaxAge: 31536000, immutable: true }))
router.use(assetRouter({ maxAge: 3600, publicMaxAge: 0, immutable: false }))

/** Where the pages and the shell find each asset (relative to a base URL such as the approuter's app prefix). */
function urls(base = '') {
  const root = `${base}${mountPath}/v${version}`
  return {
    version,
    root,
    styles: {
      variables: theme => `${root}/theming-base-content/content/Base/baseLib/${theme}/css_variables.css`,
      theme: theme => `${root}/fundamental-styles/theming/${theme}.css`,
      common: `${root}/common-css/common-css.css`,
      fundamental: `${root}/fundamental-styles/fundamental-styles.css`,
      own: [`${root}/public/htmx-fiori.css`, `${root}/public/htmx-dialogs.css`]
    },
    scripts: {
      htmx: `${root}/htmx.org/htmx.min.js`,
      sse: `${root}/htmx.org/ext/hx-sse.min.js`,
      own: [`${root}/public/htmx-fiori.js`, `${root}/public/htmx-tables.js`]
    }
  }
}

module.exports = { mountPath, router, version, urls, distDirOf, compressedStatic }
