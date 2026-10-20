/**
 * Parsing/formatting of OData-style key segments, e.g. Books(ID=2b23...,IsActiveEntity=true)
 */

function splitSegments(path) {
  // Splits "Books(ID=1)/chapters(ID=2)" into [{ set: 'Books', keys: 'ID=1' }, { set: 'chapters', keys: 'ID=2' }]
  const segments = []
  const re = /([^/(]+)(?:\(([^)]*)\))?/g
  let m
  while ((m = re.exec(path))) {
    if (!m[1]) continue
    segments.push({ set: m[1], raw: m[2] ?? null })
  }
  return segments
}

function parseKeyValue(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw)
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
  return raw // UUIDs and other bare literals
}

function parseKeys(raw) {
  if (raw == null || raw === '') return {}
  const keys = {}
  // simple split works because key values here never contain ')' or unescaped ','
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) { keys.ID = parseKeyValue(part.trim()); continue }
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    keys[name] = parseKeyValue(value)
  }
  return keys
}

function formatKeyValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

function formatKeys(keys) {
  return Object.entries(keys).map(([k, v]) => `${k}=${formatKeyValue(v)}`).join(',')
}

module.exports = { splitSegments, parseKeys, formatKeys, parseKeyValue, formatKeyValue }
