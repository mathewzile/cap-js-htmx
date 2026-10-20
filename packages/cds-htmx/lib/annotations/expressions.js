/**
 * Evaluates the small subset of the OData CSDL dynamic-expression language that FE/CAP annotations
 * actually use (Hidden, FieldControl, Criticality, OperationAvailable, Updatable/Deletable paths,
 * computed Labels, ...). Expressions are the literal JSON shapes `cds.compile.to.edm()` emits
 * (verified against a live compile, see annotations.cds), e.g. `{ "$Path": "author/name" }`.
 */

const isExpr = v => v != null && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).some(k => k.startsWith('$'))

/** Resolves a (possibly navigation) path like `author/name` against a row that may carry
 *  navigation results as nested objects (as CQL .columns('author.name') / expand would shape it). */
function resolvePath(row, path) {
  if (row == null) return undefined
  const nested = path.split('/').reduce((value, segment) => value == null ? undefined : value[segment], row)
  return nested ?? (path.includes('/') ? row[path.replace(/\//g, '_')] : undefined)
}

/** Collects every `$Path` referenced anywhere inside a value -- an expression, or a whole
 *  annotation/layout record tree (DataField's `Value`, a column's `criticality`, a `FieldLayout`'s
 *  `unit`/`currency`, a whole `OPLayout`...) -- so callers can build the SELECT column list needed
 *  to evaluate it later (§3.3: "the union of `paths()` over all rendered annotation values"). Walks
 *  every own property, not just `$`-prefixed ones, since `$Path` expressions are nested under
 *  plain keys too (e.g. a `DataField` record's `{ Value: { $Path: 'title' } }`). */
function paths(expr) {
  const found = new Set()
  const visit = node => {
    if (node == null || typeof node !== 'object') return // plain strings/numbers/booleans are literals, not paths
    if (Array.isArray(node)) return node.forEach(visit)
    if (typeof node.$Path === 'string') { found.add(node.$Path); return }
    for (const key of Object.keys(node)) visit(node[key])
  }
  visit(expr)
  return [...found]
}

function evaluate(expr, row, ctx = {}) {
  if (expr == null) return expr
  if (typeof expr !== 'object' || Array.isArray(expr)) return expr // literal
  if ('$Path' in expr) return resolvePath(row, expr.$Path)
  if ('$Null' in expr) return null
  if ('$EnumMember' in expr) return expr.$EnumMember.split('/').pop()
  if ('$If' in expr) {
    const [cond, then, els] = expr.$If
    return evaluate(cond, row, ctx) ? evaluate(then, row, ctx) : evaluate(els, row, ctx)
  }
  if ('$And' in expr) return expr.$And.every(e => evaluate(e, row, ctx))
  if ('$Or' in expr) return expr.$Or.some(e => evaluate(e, row, ctx))
  if ('$Not' in expr) return !evaluate(expr.$Not, row, ctx)
  if ('$Eq' in expr) return evaluate(expr.$Eq[0], row, ctx) === evaluate(expr.$Eq[1], row, ctx)
  if ('$Ne' in expr) return evaluate(expr.$Ne[0], row, ctx) !== evaluate(expr.$Ne[1], row, ctx)
  if ('$Gt' in expr) return evaluate(expr.$Gt[0], row, ctx) > evaluate(expr.$Gt[1], row, ctx)
  if ('$Ge' in expr) return evaluate(expr.$Ge[0], row, ctx) >= evaluate(expr.$Ge[1], row, ctx)
  if ('$Lt' in expr) return evaluate(expr.$Lt[0], row, ctx) < evaluate(expr.$Lt[1], row, ctx)
  if ('$Le' in expr) return evaluate(expr.$Le[0], row, ctx) <= evaluate(expr.$Le[1], row, ctx)
  if ('$Apply' in expr) return evaluateApply(expr, row, ctx)
  if ('$LabeledElement' in expr) return evaluate(expr.$LabeledElement, row, ctx)
  return expr // unknown/opaque shape: treat as a literal record (e.g. a nested annotation record)
}

function evaluateApply({ $Function: fn, $Apply: args }, row, ctx) {
  const values = args.map(a => evaluate(a, row, ctx))
  switch (fn) {
    case 'odata.concat': return values.join('')
    case 'odata.uriEncode': return encodeURIComponent(String(values[0] ?? ''))
    case 'odata.fillUriTemplate': {
      const [template, ...params] = args
      let url = evaluate(template, row, ctx)
      for (const p of params) if (p && typeof p === 'object' && '$Name' in p)
        url = url.replace(`{${p.$Name}}`, encodeURIComponent(evaluate(p.$LabeledElement ?? p, row, ctx) ?? ''))
      return url
    }
    default: return values[0]
  }
}

module.exports = { isExpr, resolvePath, paths, evaluate }
