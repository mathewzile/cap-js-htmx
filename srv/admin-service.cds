using { sap.capire.bookshop as my } from '../db/schema';

service AdminService @(odata:'/admin') @htmx {
  @odata.draft.enabled
  entity Authors as projection on my.Authors;
  @readonly
  entity Books as projection on my.Books;
  entity Genres as projection on my.Genres;
  @odata.draft.enabled
  @hierarchy
  entity Categories as projection on my.Categories actions {
    // Hierarchy.RecursiveHierarchyActions.ChangeNextSiblingAction: puts the node before NextSibling (last when empty), Move Up/Down and drops between nodes
    action changeNextSibling(NextSibling : { ID : UUID }) returns Categories;
  };
  @odata.draft.enabled
  entity Catalogs as projection on my.Catalogs;
  @hierarchy
  entity Topics as projection on my.Topics;

  event AuthorChanged : { ID: UUID };
  event StockChanged  : { ID: UUID };
}