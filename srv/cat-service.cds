using { sap.capire.bookshop as my } from '../db/schema';

@odata @htmx
service CatalogService {

  @odata.draft.enabled
  entity Books as projection on my.Books actions {
    action addStock(quantity: Integer);
  };

  entity Authors as projection on my.Authors;

  @readonly
  entity Genres as projection on my.Genres;

  action simulateDelivery(book: UUID, qty: Integer);

  event StockChanged : { ID: UUID };
}
