const fs = require('node:fs')
const path = require('node:path')

/** `cds.compile.to.edm(model, {service, locale})` does NOT resolve `{i18n>Key}` placeholders
 *  embedded inside annotation record values (verified live: `UI.HeaderInfo.TypeName` stays the
 *  literal string `"{i18n>Book}"` even with `locale:'en'` passed) -- so layout labels still carry
 *  raw placeholders after `cds.compile.to.edm()`. This module resolves them ourselves, directly
 *  from the `.properties` bundles, as a deep-walk pass applied once per cached layout build. */

const PLUGIN_I18N_DIR = path.join(__dirname, '..', '_i18n')
const PLACEHOLDER = /^\{i18n>([^}]+)\}$/

const bundleCache = new Map() // `${dirs}:${locale}` -> flat {key: text}

function parseProperties(content) {
  const out = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

function loadFile(file) {
  try {
    return parseProperties(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/** Base bundle plus the locale fallback chain `.properties` i18n bundles use (`en_US` -> `en` ->
 *  base), each more specific file merged over the previous so a missing key in `en_US` still
 *  falls back to `en`/base. */
function loadDir(dir, locale) {
  const merged = loadFile(path.join(dir, 'i18n.properties'))
  if (!locale) return merged
  const parts = locale.split(/[-_]/)
  for (let i = 1; i <= parts.length; i++) {
    Object.assign(merged, loadFile(path.join(dir, `i18n_${parts.slice(0, i).join('_')}.properties`)))
  }
  return merged
}

/** Merges the plugin's own UI-chrome bundle (`_i18n/i18n*.properties`, §1 repo layout: "Go",
 *  "Create", "Draft saved.", ...) with the CDS model's bundle (`<appRoot>/_i18n/i18n*.properties`,
 *  the one `{i18n>Book}`-style annotation placeholders resolve against), caching per (dirs, locale). */
function bundleFor(appRoot, locale) {
  const dirs = appRoot ? [PLUGIN_I18N_DIR, path.join(appRoot, '_i18n')] : [PLUGIN_I18N_DIR]
  const key = `${dirs.join('|')}:${locale || ''}`
  let bundle = bundleCache.get(key)
  if (!bundle) {
    bundle = {}
    for (const dir of dirs) Object.assign(bundle, loadDir(dir, locale))
    bundleCache.set(key, bundle)
  }
  return bundle
}

/** Looks up a plain UI-chrome text key (not a `{i18n>...}`-wrapped placeholder) directly, e.g.
 *  `t(bundle, 'Go')`. Falls back to the key itself so a missing translation is visible, not blank. */
function t(bundle, key) {
  return bundle[key] ?? key
}

function resolveText(value, bundle) {
  if (typeof value !== 'string') return value
  const m = value.match(PLACEHOLDER)
  if (!m) return value
  return bundle[m[1]] ?? m[1]
}

/** Deep-walks a layout model (plain objects/arrays/Maps built by `model/list-report.js` and
 *  `model/object-page.js`) and replaces every `{i18n>Key}` string leaf with its translated text.
 *  Everything else -- expression objects (`{$Path:...}`), numbers, booleans, already-resolved
 *  strings -- passes through untouched, so this is safe to run unconditionally over a whole
 *  `LRLayout`/`OPLayout` tree once per cache build. */
function translate(value, bundle) {
  if (Array.isArray(value)) return value.map(v => translate(v, bundle))
  if (value instanceof Map) {
    const out = new Map()
    for (const [k, v] of value) out.set(k, translate(v, bundle))
    return out
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = translate(v, bundle)
    return out
  }
  return resolveText(value, bundle)
}

module.exports = { bundleFor, t, resolveText, translate, parseProperties, PLUGIN_I18N_DIR }
