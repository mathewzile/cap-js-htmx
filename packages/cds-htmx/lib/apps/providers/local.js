const fs = require('node:fs')
const path = require('node:path')
const { findManifests } = require('../../annotations/manifest')
const { appRoot } = require('../../config')
const { AppError } = require('../errors')

/** Latest modification time of everything below `dir`: the cheap "did the app change" check that
 *  lets `cds watch` pick up an edited `annotation.xml` without a restart. */
function newestMtime(dir) {
  let newest = 0
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    try { newest = Math.max(newest, fs.statSync(path.join(dir, entry)).mtimeMs) } catch { /* vanished mid-scan */ }
  }
  return newest
}

/** `{ kind: 'local', root? }`: finds the app by `sap.app.id` among the `webapp/manifest.json` files
 *  under `root` (default: the project's `app/` folder). Development default, and the source for
 *  co-deployed apps; `volatile` tells the registry to re-check it instead of trusting a TTL. */
module.exports = function local({ root } = {}) {
  return {
    kind: 'local',
    volatile: true,
    async resolve(appId) {
      for (const manifestPath of findManifests(root || appRoot())) {
        let manifest
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { continue }
        if (manifest['sap.app']?.id !== appId) continue
        const dir = path.dirname(manifestPath)
        return {
          manifest,
          etag: String(newestMtime(dir)),
          async readFile(rel) {
            const full = path.resolve(dir, rel)
            if (!full.startsWith(dir + path.sep)) throw new AppError(400, `Path escapes the app: ${rel}`)
            try { return await fs.promises.readFile(full, 'utf8') } catch (err) {
              if (err.code === 'ENOENT') return null
              throw err
            }
          }
        }
      }
      return null
    }
  }
}
