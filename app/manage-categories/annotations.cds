using AdminService as service from '../../srv/admin-service';

// The Fiori elements reference for the htmx tree table: a draft-enabled tree (create child, cut / paste to move a node).
// Its htmx counterpart is checked against what this app shows and sends.
annotate service.Categories with @(
    UI.HeaderInfo : {
        TypeName       : 'Category',
        TypeNamePlural : 'Categories',
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
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'General',
            Label  : 'General',
            Target : '@UI.FieldGroup#General',
        },
    ],
);

annotate service.Categories with @UI.PresentationVariant : {
    $Type                       : 'UI.PresentationVariantType',
    RecursiveHierarchyQualifier : 'CategoriesHierarchy',
    Visualizations              : ['@UI.LineItem'],
    SortOrder                   : [{ Property : rank }],
};

annotate service.Categories with @Hierarchy.RecursiveHierarchyActions #CategoriesHierarchy : {
    $Type                  : 'Hierarchy.RecursiveHierarchyActionsType',
    ChangeNextSiblingAction : 'AdminService.changeNextSibling',
};
