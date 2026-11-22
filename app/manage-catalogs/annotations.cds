using AdminService as service from '../../srv/admin-service';

// A draft root (Catalogs) whose Object Page has a tree table (its composition Topics, a hierarchy): the Fiori elements reference
// for the htmx tree table in an Object Page. The List Report is a plain table. Used by both apps, the Fiori elements and the htmx one.
annotate service.Catalogs with @(
    UI.HeaderInfo : {
        TypeName       : 'Catalog',
        TypeNamePlural : 'Catalogs',
        Title          : { Value : name },
        Description    : { Value : descr },
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : name },
        { $Type : 'UI.DataField', Value : descr },
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Value : name },
            { $Type : 'UI.DataField', Value : descr },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', ID : 'General', Label : 'General', Target : '@UI.FieldGroup#General' },
        { $Type : 'UI.ReferenceFacet', ID : 'Topics', Label : 'Topics', Target : 'topics/@UI.LineItem' },
    ],
);

annotate service.Topics with @(
    UI.HeaderInfo : {
        TypeName       : 'Topic',
        TypeNamePlural : 'Topics',
        Title          : { Value : name },
        Description    : { Value : descr },
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : name },
        { $Type : 'UI.DataField', Value : descr },
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Value : name },
            { $Type : 'UI.DataField', Value : descr },
            { $Type : 'UI.DataField', Value : parent_ID, Label : 'Parent' },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', ID : 'General', Label : 'General', Target : '@UI.FieldGroup#General' },
    ],
    UI.PresentationVariant : {
        $Type                       : 'UI.PresentationVariantType',
        RecursiveHierarchyQualifier : 'TopicsHierarchy',
        Visualizations              : ['@UI.LineItem'],
    },
);

// Field labels (Fiori elements shows none without a Common.Label; the htmx app would make one up from the property name)
annotate service.Catalogs with {
    name  @Common.Label : 'Name';
    descr @Common.Label : 'Description';
};
annotate service.Topics with {
    name   @Common.Label : 'Name';
    descr  @Common.Label : 'Description';
    parent @Common.Label : 'Parent';
};
