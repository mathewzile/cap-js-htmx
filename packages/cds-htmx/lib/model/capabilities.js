/** `CatalogService.Books` -> `CatalogService.EntityContainer/Books`, the container-member
 *  target `Capabilities.*Restrictions` annotations live under (§3.2: Capabilities row). */
function containerTarget(entityType) {
  const dot = entityType.lastIndexOf('.')
  return `${entityType.slice(0, dot)}.EntityContainer/${entityType.slice(dot + 1)}`
}

/** Restriction terms live on the container-member target (`Capabilities.*Restrictions`, §3.2).
 *  Absent in the sample today; still read generically so a future model gains support for free. */
function buildCapabilities(store, entityType) {
  const bag = store.raw(containerTarget(entityType))
  return {
    insert: bag['@Capabilities.InsertRestrictions'],
    update: bag['@Capabilities.UpdateRestrictions'],
    delete: bag['@Capabilities.DeleteRestrictions'],
    search: bag['@Capabilities.SearchRestrictions'],
    filter: bag['@Capabilities.FilterRestrictions'],
    sort: bag['@Capabilities.SortRestrictions'],
    count: bag['@Capabilities.CountRestrictions'],
    navigation: bag['@Capabilities.NavigationRestrictions']
  }
}

module.exports = { containerTarget, buildCapabilities }
