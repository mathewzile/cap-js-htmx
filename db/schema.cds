using { cuid, managed, Currency, sap.common.CodeList as CodeList } from '@sap/cds/common';

namespace sap.capire.bookshop;

entity Books : cuid, managed {
  title            : String(111) @mandatory;
  descr            : String(1111);
  author           : Association to Authors @mandatory;
  genre            : Association to Genres;
  stock            : Integer default 0;
  price            : Decimal(9,2);
  currency         : Currency;
  rating           : Decimal(2,1);
  stockStatus      : String(20)  @Core.Computed;
  stockCriticality : Integer     @Core.Computed;
  totalPages       : Integer     @Core.Computed;
  chapters         : Composition of many Chapters on chapters.book = $self;
}

entity Chapters : cuid {
  book  : Association to Books;
  title : String(111) @mandatory;
  pages : Integer;
}

entity Authors : cuid {
  name        : String(111) @mandatory;
  dateOfBirth : Date;
  email       : String(111);
  phone       : String(30);
  books       : Association to many Books on books.author = $self;
  awards      : Composition of many Awards on awards.author = $self;
}

entity Awards : cuid {
  author : Association to Authors;
  name   : String(111) @mandatory;
  year   : Integer;
}

entity Genres : cuid, CodeList {
  parent   : Association to Genres;
  children : Composition of many Genres on children.parent = $self;
}

// A tree edited as drafts (create child, move node): the Fiori elements reference sample for the htmx tree table's editing
entity Categories : cuid {
  name     : String(111) @mandatory;
  descr    : String(1111);
  rank     : Integer; // the order among the nodes of one parent (changed by the changeNextSibling action)
  parent   : Association to Categories;
  children : Composition of many Categories on children.parent = $self;
}

// A draft root with a tree inside it (the tree is a composition of the root, shown as the hierarchy table of its Object Page):
// the Fiori elements reference sample for the htmx tree table in an Object Page, edited together with the root's draft
entity Catalogs : cuid {
  name   : String(111) @mandatory;
  descr  : String(1111);
  topics : Composition of many Topics on topics.catalog = $self;
}

entity Topics : cuid {
  catalog  : Association to Catalogs;
  name     : String(111) @mandatory;
  descr    : String(1111);
  parent   : Association to Topics;
  children : Composition of many Topics on children.parent = $self;
}
