const fs = require('node:fs')
const { XMLParser } = require('fast-xml-parser')
const { typeFromUrl } = require('./vocab')

// `preserveOrder`: the operands of an expression (`<If>`, `<Gt>`, ...) are positional, so the document order
// of the child elements has to survive. A node is `{ Tag: [children], ':@': { '@_Attr': value } }`, text is `{ '#text': value }`.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false
})

const tagOf = node => Object.keys(node).find(k => k !== ':@')
const attrsOf = node => node[':@'] || {}
const kidsOf = node => node[tagOf(node)] || []
const childrenWith = (node, tag) => kidsOf(node).filter(k => tagOf(k) === tag)
const textOf = node => kidsOf(node).map(k => k['#text'] ?? '').join('')

/** Shortcut attributes that carry a static reference (string), as opposed to `Path=` which is
 *  the dynamic "value of this property at runtime" expression. Mirrors what `cds.compile.to.edm()`
 *  itself emits (see annotations.cds verification): Target/LocalDataProperty/... are plain strings. */
const STATIC_PATH_ATTRS = ['PropertyPath', 'NavigationPropertyPath', 'AnnotationPath']

function parseScalarAttr(attrs) {
  if ('@_Path' in attrs) return { $Path: attrs['@_Path'] }
  for (const name of STATIC_PATH_ATTRS) if (`@_${name}` in attrs) return attrs[`@_${name}`]
  if ('@_String' in attrs) return attrs['@_String']
  if ('@_Bool' in attrs) return attrs['@_Bool'] === 'true' || attrs['@_Bool'] === true
  if ('@_Int' in attrs) return parseInt(attrs['@_Int'], 10)
  if ('@_Decimal' in attrs) return parseFloat(attrs['@_Decimal'])
  if ('@_Float' in attrs) return parseFloat(attrs['@_Float'])
  if ('@_EnumMember' in attrs) return String(attrs['@_EnumMember']).split('/').pop()
  if ('@_Date' in attrs) return attrs['@_Date']
  if ('@_DateTimeOffset' in attrs) return attrs['@_DateTimeOffset']
  if ('@_Guid' in attrs) return attrs['@_Guid']
  if ('@_Null' in attrs) return null
  return undefined
}

function resolveAlias(aliasMap, typeAttr) {
  if (!typeAttr) return undefined
  if (typeAttr.includes('.') && !typeAttr.includes('/')) {
    // Already `Namespace.Term` or `Alias.Term`; normalize namespace prefixes we know about.
    for (const [ns, alias] of aliasMap) if (typeAttr.startsWith(ns + '.')) return alias + typeAttr.slice(ns.length)
    return typeAttr
  }
  return typeFromUrl(typeAttr)
}

/** Parses one expression element (`<Path>`, `<Null>`, `<Int>`, `<If>`, `<Eq>`, `<Apply>`, ...) into
 *  the same JSON expression shape `evaluate()`/`paths()` in expressions.js understand. Not an expression: `undefined`. */
function parseExpressionElement(node) {
  const tag = tagOf(node)
  switch (tag) {
    case 'Path': return { $Path: textOf(node) }
    case 'Null': return null
    case 'String': case 'Date': case 'DateTimeOffset': case 'Guid': return textOf(node)
    case 'Int': return parseInt(textOf(node), 10)
    case 'Decimal': case 'Float': return parseFloat(textOf(node))
    case 'Bool': return textOf(node).trim() === 'true'
    case 'EnumMember': return textOf(node).trim().split('/').pop()
    case 'If': case 'Eq': case 'Ne': case 'And': case 'Or': case 'Gt': case 'Ge': case 'Lt': case 'Le':
      return { ['$' + tag]: childExpressions(node) }
    case 'Not': return { $Not: childExpressions(node)[0] }
    case 'Apply': return { $Function: attrsOf(node)['@_Function'], $Apply: childExpressions(node) }
    default: return undefined
  }
}

const EXPR_TAGS = new Set(['Path', 'Null', 'String', 'Date', 'DateTimeOffset', 'Guid', 'Int', 'Decimal', 'Float', 'Bool', 'EnumMember',
  'If', 'Eq', 'Ne', 'And', 'Or', 'Not', 'Gt', 'Ge', 'Lt', 'Le', 'Apply'])

/** The expression children of a node, in document order (operand order matters: `If` is condition, then, else). */
function childExpressions(node) {
  return kidsOf(node).filter(k => EXPR_TAGS.has(tagOf(k))).map(parseExpressionElement)
}

/** Parses a `<Record>`/`<PropertyValue>`/`<Annotation>` "value container": attribute shortcuts,
 *  a nested `<Record>`, a `<Collection>`, or a dynamic-expression child element. */
function parseValueContainer(node, aliasMap) {
  const scalar = parseScalarAttr(attrsOf(node))
  if (scalar !== undefined) return scalar

  const records = childrenWith(node, 'Record')
  if (records.length) {
    return records.length === 1 ? parseRecord(records[0], aliasMap) : records.map(r => parseRecord(r, aliasMap))
  }
  const [collection] = childrenWith(node, 'Collection')
  if (collection) return parseCollection(collection, aliasMap)
  const exprs = childExpressions(node)
  return exprs.length ? exprs[0] : undefined
}

function parseRecord(record, aliasMap) {
  const out = {}
  const type = resolveAlias(aliasMap, attrsOf(record)['@_Type'])
  if (type) out['@type'] = type
  for (const pv of childrenWith(record, 'PropertyValue')) out[attrsOf(pv)['@_Property']] = parseValueContainer(pv, aliasMap)
  return out
}

function parseCollection(collection, aliasMap) {
  const records = childrenWith(collection, 'Record')
  if (records.length) return records.map(r => parseRecord(r, aliasMap))
  for (const tag of ['String', 'PropertyPath', 'NavigationPropertyPath', 'AnnotationPath', 'Path']) {
    const items = childrenWith(collection, tag)
    if (items.length) return items.map(textOf)
  }
  return []
}

/** Parses one `annotation.xml` document into `{ $Annotations: { [target]: { [AliasTerm#Qualifier]: value } } }`,
 *  the same shape `source.js` extracts from `cds.compile.to.edm()`, so `store.js` can merge the two uniformly. */
function parseAnnotationXml(xml) {
  const edmx = parser.parse(xml).find(n => tagOf(n) === 'edmx:Edmx')
  const aliasMap = []
  for (const ref of edmx ? childrenWith(edmx, 'edmx:Reference') : []) {
    for (const inc of childrenWith(ref, 'edmx:Include')) {
      const { '@_Namespace': ns, '@_Alias': alias } = attrsOf(inc)
      if (ns && alias) aliasMap.push([ns, alias])
    }
  }

  const $Annotations = {}
  for (const services of edmx ? childrenWith(edmx, 'edmx:DataServices') : []) {
    for (const schema of childrenWith(services, 'Schema')) {
      for (const group of childrenWith(schema, 'Annotations')) {
        const bag = $Annotations[attrsOf(group)['@_Target']] ??= {}
        for (const annotation of childrenWith(group, 'Annotation')) {
          const { '@_Term': rawTerm, '@_Qualifier': qualifier } = attrsOf(annotation)
          const term = resolveAlias(aliasMap, rawTerm) || rawTerm
          bag[qualifier ? `@${term}#${qualifier}` : `@${term}`] = parseValueContainer(annotation, aliasMap)
        }
      }
    }
  }
  return { $Annotations }
}

function parseAnnotationXmlFile(path) {
  return parseAnnotationXml(fs.readFileSync(path, 'utf8'))
}

module.exports = { parseAnnotationXml, parseAnnotationXmlFile }
