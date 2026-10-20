const { annotationsOf } = require('./source')
const { parseAnnotationXmlFile } = require('./xml')
const { scanService } = require('./manifest')
const { parseAnnotationKey } = require('./vocab')

/** Read-only view over a merged `$Annotations` map (service-compiled + any XML layers already
 *  folded in by `build()`), exposing the two lookups the layout builders/term registry need. */
class AnnotationStore {
  constructor(targets) {
    this.targets = targets
  }

  /** `store.get('CatalogService.Books', 'UI.LineItem')` / `get(target, 'Common.SideEffects', 'Stock')`. */
  get(target, term, qualifier) {
    const bag = this.targets[target]
    if (!bag) return undefined
    return bag[qualifier ? `@${term}#${qualifier}` : `@${term}`]
  }

  /** The target's whole annotation bag, keyed by `@Alias.Term(#Qualifier)`. */
  raw(target) {
    return this.targets[target] || {}
  }

  /** Every parsed `{key, alias, term, qualifier, nested, value}` entry for one target. */
  terms(target) {
    const bag = this.targets[target] || {}
    return Object.keys(bag).map(key => ({ key, ...parseAnnotationKey(key), value: bag[key] }))
  }

  /** Every target string belonging to one entity type: the type itself, its properties
   *  (`Entity/prop`, incl. nav paths `Entity/author/name`), and its container-member/action
   *  targets are NOT included here (those are looked up by their own full target string). */
  targetsOf(entityType) {
    return Object.keys(this.targets).filter(t => t === entityType || t.startsWith(`${entityType}/`))
  }
}

/** Merges one annotation layer into the accumulator. Per target, each `@Alias.Term(#Qualifier)`
 *  key is replaced wholesale by the later layer (FE's own layering semantics: layering is keyed
 *  by target + term + qualifier, never a deep merge within a collection/record). */
function mergeLayer(base, layer) {
  for (const [target, bag] of Object.entries(layer)) {
    Object.assign(base[target] ??= {}, bag)
  }
  return base
}

/** Builds the layered store for one `@htmx` service: the compiled service annotations first,
 *  then (if `appRoot` is given) every local `annotation.xml` an FE app declares against the same
 *  service path, in manifest order — later files win, exactly like FE's own metadata merge. */
function build(model, service, servicePath, { appRoot, locale } = {}) {
  const merged = {}
  mergeLayer(merged, annotationsOf(model, service, locale))
  if (appRoot) {
    for (const file of scanService(appRoot, servicePath).annotationFiles) {
      mergeLayer(merged, parseAnnotationXmlFile(file).$Annotations)
    }
  }
  return new AnnotationStore(merged)
}

module.exports = { AnnotationStore, build, mergeLayer }
