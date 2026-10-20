const fs = require('node:fs')
const { XMLParser } = require('fast-xml-parser')
const { typeFromUrl } = require('./vocab')

const ARRAY_TAGS = new Set([
  'edmx:Reference', 'edmx:Include', 'Schema', 'Annotations', 'Annotation',
  'Record', 'PropertyValue', 'Collection', 'String', 'Path', 'PropertyPath',
  'NavigationPropertyPath', 'AnnotationPath', 'Int', 'Bool', 'EnumMember'
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  isArray: tagName => ARRAY_TAGS.has(tagName)
})

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

/** Parses one expression child element (`<Path>`, `<Null>`, `<If>`, `<Eq>`, `<Apply>`, ...) into
 *  the same JSON expression shape `evaluate()`/`paths()` in expressions.js understand. */
function parseExpressionElement(tag, node, aliasMap) {
  switch (tag) {
    case 'Path': return { $Path: typeof node === 'string' ? node : node['#text'] }
    case 'Null': return null
    case 'String': return typeof node === 'string' ? node : node['#text']
    case 'If': return { $If: (node.Path || node.Eq || node.And || node.Or || node.Not ? [] : [])
      .concat(childExpressions(node, aliasMap)) }
    case 'Eq': return { $Eq: childExpressions(node, aliasMap) }
    case 'Ne': return { $Ne: childExpressions(node, aliasMap) }
    case 'And': return { $And: childExpressions(node, aliasMap) }
    case 'Or': return { $Or: childExpressions(node, aliasMap) }
    case 'Not': return { $Not: childExpressions(node, aliasMap)[0] }
    case 'Gt': return { $Gt: childExpressions(node, aliasMap) }
    case 'Ge': return { $Ge: childExpressions(node, aliasMap) }
    case 'Lt': return { $Lt: childExpressions(node, aliasMap) }
    case 'Le': return { $Le: childExpressions(node, aliasMap) }
    case 'Apply': return {
      $Function: node['@_Function'],
      $Apply: childExpressions(node, aliasMap)
    }
    default: return undefined
  }
}

const EXPR_TAGS = ['Path', 'Null', 'String', 'If', 'Eq', 'Ne', 'And', 'Or', 'Not', 'Gt', 'Ge', 'Lt', 'Le', 'Apply']

function childExpressions(node, aliasMap) {
  const out = []
  for (const tag of EXPR_TAGS) {
    if (node[tag] === undefined) continue
    const items = Array.isArray(node[tag]) ? node[tag] : [node[tag]]
    for (const item of items) out.push(parseExpressionElement(tag, item, aliasMap))
  }
  return out
}

/** Parses a `<Record>`/`<PropertyValue>`/`<Annotation>` "value container": attribute shortcuts,
 *  a nested `<Record>`, a `<Collection>`, or a dynamic-expression child element. `contextTerm`
 *  names the enclosing collection (e.g. `UI.LineItem`) so the Record's `$Type` can be omitted
 *  when it matches the term's implicit default, exactly like CAP's own compiler output does. */
function parseValueContainer(node, aliasMap, contextTerm) {
  const scalar = parseScalarAttr(node)
  if (scalar !== undefined) return scalar

  if (node.Record) {
    const records = Array.isArray(node.Record) ? node.Record : [node.Record]
    return records.length === 1 ? parseRecord(records[0], aliasMap, contextTerm) : records.map(r => parseRecord(r, aliasMap, contextTerm))
  }
  if (node.Collection) {
    // `Collection` is itself forced into an array by ARRAY_TAGS (XML never repeats it per
    // container), so unwrap to the single collection object before parsing its children.
    const collection = Array.isArray(node.Collection) ? node.Collection[0] : node.Collection
    return parseCollection(collection, aliasMap, contextTerm)
  }
  const exprs = childExpressions(node, aliasMap)
  if (exprs.length) return exprs[0]
  return undefined
}

function parseRecord(record, aliasMap, contextTerm) {
  const out = {}
  const type = resolveAlias(aliasMap, record['@_Type'])
  if (type) out['@type'] = type
  const values = record.PropertyValue ? (Array.isArray(record.PropertyValue) ? record.PropertyValue : [record.PropertyValue]) : []
  for (const pv of values) {
    const prop = pv['@_Property']
    out[prop] = parseValueContainer(pv, aliasMap, `${type || contextTerm}.${prop}`)
  }
  return out
}

function parseCollection(collection, aliasMap, contextTerm) {
  if (collection.Record) {
    const records = Array.isArray(collection.Record) ? collection.Record : [collection.Record]
    return records.map(r => parseRecord(r, aliasMap, contextTerm))
  }
  for (const tag of ['String', 'PropertyPath', 'NavigationPropertyPath', 'AnnotationPath', 'Path']) {
    if (collection[tag] !== undefined) {
      const items = Array.isArray(collection[tag]) ? collection[tag] : [collection[tag]]
      return items.map(v => typeof v === 'string' ? v : v['#text'])
    }
  }
  return []
}

/** Parses one `annotation.xml` document into `{ $Annotations: { [target]: { [AliasTerm#Qualifier]: value } } }`,
 *  the same shape `source.js` extracts from `cds.compile.to.edm()`, so `store.js` can merge the two uniformly. */
function parseAnnotationXml(xml) {
  const doc = parser.parse(xml)
  const edmx = doc['edmx:Edmx']
  const aliasMap = []
  for (const ref of edmx?.['edmx:Reference'] || []) {
    for (const inc of ref['edmx:Include'] || []) {
      if (inc['@_Namespace'] && inc['@_Alias']) aliasMap.push([inc['@_Namespace'], inc['@_Alias']])
    }
  }

  const $Annotations = {}
  const schemas = edmx?.['edmx:DataServices']?.Schema || []
  for (const schema of schemas) {
    for (const group of schema.Annotations || []) {
      const target = group['@_Target']
      const bag = $Annotations[target] ??= {}
      for (const annotation of group.Annotation || []) {
        const term = resolveAlias(aliasMap, annotation['@_Term']) || annotation['@_Term']
        const qualifier = annotation['@_Qualifier']
        const key = qualifier ? `@${term}#${qualifier}` : `@${term}`
        bag[key] = parseValueContainer(annotation, aliasMap, term)
      }
    }
  }
  return { $Annotations }
}

function parseAnnotationXmlFile(path) {
  return parseAnnotationXml(fs.readFileSync(path, 'utf8'))
}

module.exports = { parseAnnotationXml, parseAnnotationXmlFile }
