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

entity Genres : CodeList {
  key ID : Integer;
  parent : Association to Genres;
}
