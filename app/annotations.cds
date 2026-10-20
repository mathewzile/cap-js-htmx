using CatalogService as service from '../srv/cat-service';

annotate service.Books with @(
  Common.SideEffects #Stock : {
    SourceProperties : [stock],
    TargetProperties : ['stockStatus', 'stockCriticality']
  },
  Common.SideEffects #Pages : {
    SourceEntities    : [chapters],
    TargetProperties  : ['totalPages']
  },
  Common.SideEffects #Push : {
    SourceEvents      : ['StockChanged'],
    TargetProperties  : ['stock', 'stockStatus', 'stockCriticality']
  },

  UI.HeaderInfo : {
    TypeName       : '{i18n>Book}',
    TypeNamePlural : '{i18n>Books}',
    Title          : { Value : title },
    Description    : { Value : descr },
    TypeImageUrl   : 'sap-icon://learning-assistant'
  },

  UI.SelectionFields : [author_ID, genre_ID, stockStatus],

  UI.LineItem : [
    { Value : title, Label : '{i18n>Title}' },
    { Value : author.name, Label : '{i18n>Author}' },
    { Value : genre.name, Label : '{i18n>Genre}' },
    { Value : stock, Label : '{i18n>Stock}', Criticality : stockCriticality },
    { Value : stockStatus, Label : '{i18n>Status}', Criticality : stockCriticality },
    { Value : price, Label : '{i18n>Price}' },
    { Value : rating, Label : '{i18n>Rating}' }
  ],

  UI.Facets : [
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'GeneralInfo',
      Label  : '{i18n>GeneralInformation}',
      Target : '@UI.FieldGroup#General'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'Availability',
      Label  : '{i18n>Availability}',
      Target : '@UI.FieldGroup#Availability'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'RatingFacet',
      Label  : '{i18n>Rating}',
      Target : '@UI.DataPoint#Rating'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'Chapters',
      Label  : '{i18n>Chapters}',
      Target : 'chapters/@UI.LineItem'
    }
  ],

  UI.FieldGroup #General : {
    Data : [
      { Value : title },
      { Value : descr },
      { Value : author_ID },
      { Value : genre_ID }
    ]
  },

  UI.FieldGroup #Availability : {
    Data : [
      { Value : stock },
      { Value : stockStatus, Criticality : stockCriticality },
      { Value : price },
      { Value : currency_code }
    ]
  },

  UI.DataPoint #Rating : {
    Value          : rating,
    Title          : '{i18n>Rating}',
    TargetValue    : 5,
    Visualization  : #Rating
  }
);

annotate service.Books with {
  title    @Common.Label : '{i18n>Title}';
  descr    @Common.Label : '{i18n>Description}' @UI.MultiLineText;
  author   @Common.Label : '{i18n>Author}'
           @Common.ValueList : {
             CollectionPath : 'Authors',
             Parameters     : [
               { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : author_ID, ValueListProperty : 'ID' },
               { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' }
             ]
           };
  genre    @Common.Label : '{i18n>Genre}'
           @Common.ValueListWithFixedValues : true
           @Common.ValueList : {
             CollectionPath : 'Genres',
             Parameters     : [
               { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : genre_ID, ValueListProperty : 'ID' },
               { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' }
             ]
           };
  stock    @Common.Label : '{i18n>Stock}'
           @Validation.Minimum : 0
           @Validation.Maximum : 9999;
  price    @Common.Label : '{i18n>Price}'
           @Measures.ISOCurrency : currency_code;
  currency @Common.Label : '{i18n>Currency}';
  rating   @Common.Label : '{i18n>Rating}'
           @Validation.Minimum : 0
           @Validation.Maximum : 5;
  stockStatus @Common.Label : '{i18n>Status}';
  totalPages  @Common.Label : '{i18n>TotalPages}';
};

annotate service.Books actions {
  addStock @(
    Common.IsActionCritical : false,
    Common.SideEffects : { TargetProperties : ['stock', 'stockStatus', 'stockCriticality'] }
  );
};

annotate service.Chapters with @(
  UI.HeaderInfo : {
    TypeName       : '{i18n>Chapter}',
    TypeNamePlural : '{i18n>Chapters}',
    Title          : { Value : title }
  },
  UI.LineItem : [
    { Value : title, Label : '{i18n>Title}' },
    { Value : pages, Label : '{i18n>Pages}' }
  ],
  UI.Facets : [
    { $Type : 'UI.ReferenceFacet', ID : 'ChapterInfo', Label : '{i18n>GeneralInformation}', Target : '@UI.FieldGroup#General' }
  ],
  UI.FieldGroup #General : {
    Data : [
      { Value : title },
      { Value : pages }
    ]
  }
);

annotate service.Authors with @(
  UI.HeaderInfo : {
    TypeName       : '{i18n>Author}',
    TypeNamePlural : '{i18n>Authors}',
    Title          : { Value : name }
  },
  UI.SelectionFields : [name],
  UI.LineItem : [
    { Value : name, Label : '{i18n>Name}' },
    { Value : email, Label : '{i18n>Email}' },
    { Value : phone, Label : '{i18n>Phone}' }
  ],
  UI.Facets : [
    { $Type : 'UI.ReferenceFacet', ID : 'ContactInfo', Label : '{i18n>Contact}', Target : '@Communication.Contact' },
    { $Type : 'UI.ReferenceFacet', ID : 'AuthorBooks', Label : '{i18n>Books}', Target : 'books/@UI.LineItem' }
  ],
  Communication.Contact : {
    fn    : name,
    bday  : dateOfBirth,
    email : [{ address : email }],
    tel   : [{ uri : phone }]
  }
);

annotate service.Authors with {
  name        @Common.Label : '{i18n>Name}';
  email       @Common.Label : '{i18n>Email}' @Communication.IsEmailAddress;
  phone       @Common.Label : '{i18n>Phone}' @Communication.IsPhoneNumber;
  dateOfBirth @Common.Label : '{i18n>DateOfBirth}';
};

annotate service.Genres with @(
  UI.HeaderInfo : { TypeName : '{i18n>Genre}', TypeNamePlural : '{i18n>Genres}', Title : { Value : name } },
  UI.LineItem   : [ { Value : name, Label : '{i18n>Name}' } ]
);
