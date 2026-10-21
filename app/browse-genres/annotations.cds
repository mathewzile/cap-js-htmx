using AdminService as service from '../../srv/admin-service';
annotate service.Genres with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Value : name,
            },
            {
                $Type : 'UI.DataField',
                Value : descr,
            },
            {
                $Type : 'UI.DataField',
                Label : 'ID',
                Value : ID,
            },
            {
                $Type : 'UI.DataField',
                Label : 'parent_ID',
                Value : parent_ID,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'ID',
            Value : ID,
        },
        {
            $Type : 'UI.DataField',
            Value : name,
        },
        {
            $Type : 'UI.DataField',
            Value : descr,
        },
        {
            $Type : 'UI.DataField',
            Label : 'parent_ID',
            Value : parent_ID,
        },
    ],
);

// Tree Views
annotate AdminService.Genres with @hierarchy;
annotate AdminService.Books:genre with @Common.ValueList.PresentationVariantQualifier: 'VH';
annotate AdminService.Genres with @UI.PresentationVariant #VH: {
  RecursiveHierarchyQualifier : 'GenresHierarchy',
};