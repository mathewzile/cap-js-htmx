using AdminService as service from '../../srv/admin-service';
using from '../../db/schema';

annotate service.Authors with @(
    // pushed by srv/admin-service.js when a draft of an author is created (SSE test in the launchpad)
    Common.SideEffects #Push : {
        SourceEvents     : ['AuthorChanged'],
        TargetProperties : ['dateOfBirth'],
        TargetEntities   : [books]
    },
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'name',
                Value : name,
            },
            {
                $Type : 'UI.DataField',
                Label : 'dateOfBirth',
                Value : dateOfBirth,
            },
            {
                $Type : 'UI.DataField',
                Label : 'email',
                Value : email,
            },
            {
                $Type : 'UI.DataField',
                Label : 'phone',
                Value : phone,
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
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Books',
            ID : 'Books',
            Target : 'books/@UI.LineItem#Books',
        },
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Awards',
            ID : 'Awards',
            Target : 'awards/@UI.LineItem#Awards',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'name',
            Value : name,
        },
        {
            $Type : 'UI.DataField',
            Label : 'dateOfBirth',
            Value : dateOfBirth,
        },
        {
            $Type : 'UI.DataField',
            Label : 'email',
            Value : email,
        },
        {
            $Type : 'UI.DataField',
            Label : 'phone',
            Value : phone,
        },
    ],
    UI.SelectionFields : [
        dateOfBirth,
    ],
    Capabilities : {
    FilterRestrictions : {
        FilterExpressionRestrictions :
            [{
                Property : 'dateOfBirth',
                AllowedExpressions : 'SingleRange'
            }]
        }
    }
);

annotate service.Authors with {
    dateOfBirth @Common.Label : 'dateOfBirth'
};

annotate service.Books with @(
    Common.SideEffects #Push : {
        SourceEvents     : ['StockChanged'],
        TargetProperties : ['stock']
    },
    UI.LineItem #Books : [
        {
            $Type : 'UI.DataField',
            Value : title,
            Label : 'title',
        },
        {
            $Type : 'UI.DataField',
            Value : stock,
            Label : 'stock',
        },
        {
            $Type : 'UI.DataField',
            Value : price,
            Label : 'price',
        },
    ],
    UI.HeaderFacets : [
        
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Value : title,
                Label : 'title',
            },
            {
                $Type : 'UI.DataField',
                Value : price,
                Label : 'price',
            },
            {
                $Type : 'UI.DataField',
                Value : rating,
                Label : 'rating',
            },
            {
                $Type : 'UI.DataField',
                Value : stock,
                Label : 'stock',
            },
            {
                $Type : 'UI.DataFieldForIntentBasedNavigation',
                Label : 'Open Manage Books App',
                SemanticObject : 'Books',
                Action : 'manageHtmx'
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'General',
            ID : 'General',
            Target : '@UI.FieldGroup#General',
        },
    ],
);

annotate service.Awards with @(
    UI.LineItem #Awards : [
        {
            $Type : 'UI.DataField',
            Value : name,
            Label : 'name',
        },
        {
            $Type : 'UI.DataField',
            Value : year,
            Label : 'year',
        },
    ],
    UI.HeaderFacets : [
        
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Value : name,
                Label : 'name',
            },
            {
                $Type : 'UI.DataField',
                Value : year,
                Label : 'year',
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'General',
            ID : 'General',
            Target : '@UI.FieldGroup#General',
        },
    ],
);

