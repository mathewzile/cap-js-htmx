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
            // a link on the value (DataFieldWithIntentBasedNavigation): the author's books, in the htmx Books app
            $Type : 'UI.DataFieldWithIntentBasedNavigation',
            Label : 'name',
            Value : name,
            SemanticObject : 'Books',
            Action : 'manageHtmx',
            Mapping : [{ $Type : 'Common.SemanticObjectMappingType', LocalProperty : ID, SemanticObjectProperty : 'author_ID' }],
            RequiredProperties : [ID],
        },
        {
            // a toolbar button (DataFieldForIntentBasedNavigation): needs one selected author
            $Type : 'UI.DataFieldForIntentBasedNavigation',
            Label : 'Show Books (HTMX)',
            SemanticObject : 'Books',
            Action : 'manageHtmx',
            RequiresContext : true,
            Mapping : [{ $Type : 'Common.SemanticObjectMappingType', LocalProperty : ID, SemanticObjectProperty : 'author_ID' }],
            RequiredProperties : [ID],
        },
        {
            $Type : 'UI.DataFieldForIntentBasedNavigation',
            Label : 'Show Books',
            SemanticObject : 'Books',
            Action : 'manage',
            RequiresContext : true,
            Mapping : [{ $Type : 'Common.SemanticObjectMappingType', LocalProperty : ID, SemanticObjectProperty : 'author_ID' }],
            RequiredProperties : [ID],
        },
        {
            // no tile of the launchpad has this intent: both kinds of app hide the button (isNavigationSupported)
            $Type : 'UI.DataFieldForIntentBasedNavigation',
            Label : 'Show Reviews',
            SemanticObject : 'Reviews',
            Action : 'display',
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
    dateOfBirth @Common.Label : 'dateOfBirth';
    // the name in the author's page is a link whose popover lists the launchpad's targets for "Authors" (Manage Authors, ... (HTMX))
    name @Common.SemanticObject : 'Authors';
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
                Label : 'Open Manage Books (HTMX)',
                SemanticObject : 'Books',
                Action : 'manageHtmx'
            },
            {
                $Type : 'UI.DataFieldForIntentBasedNavigation',
                Label : 'Open Manage Books',
                SemanticObject : 'Books',
                Action : 'manage'
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

