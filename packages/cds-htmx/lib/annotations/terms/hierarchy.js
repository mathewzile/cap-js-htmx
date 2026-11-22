/** Hierarchy (com.sap.vocabularies.Hierarchy.v1) vocabulary term coverage. The node-state properties
 *  (`DrillState`, `DistanceFromRoot` ...) it names are worked out by the plugin itself while it builds the tree.
 *  Moving a node is Cut and Paste or drag and drop (`$move`, a PATCH of the parent as Fiori elements does). `RecursiveHierarchyActions`
 *  gives Move Up / Move Down and dropping between two nodes (`ChangeNextSiblingAction`, called with `NextSibling`) and the fixed order of
 *  the top-level nodes (`ChangeSiblingForRootsSupported`); `CopyAction` (copying a node) is not built. */
module.exports = {
  RecursiveHierarchy: 'supported',
  RecursiveHierarchyActions: 'partial'
}
