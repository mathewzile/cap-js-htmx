# Fiori elements V4 annotations vs cds-htmx

Generated (Nov 2026) as the base for the remaining parity work. **How to read it:**

- *Universe*: every term of the vocabularies Fiori elements reads (SAP `UI`, `Common`, `Communication`, `Hierarchy`, `HTML5`, `PersonalData`, `Session`, `Analytics`; OASIS `Capabilities`, `Core`, `Measures`, `Validation`, `Aggregation`), from the published vocabulary JSON.
- *FE V4 docs (files)*: in how many pages of the SAPUI5 documentation for Fiori elements for OData V4 the term (or record type) is named. It is a **proxy for "Fiori elements supports it"**: SAP publishes no single machine-readable list, and a page can name a term it explains is *not* supported. `–` means no page names it.
- *cds-htmx*: the plugin's own registry (`lib/annotations/registry.js`): `supported`, `partial`, `ignored` (known, not rendered) or `missing` (the plugin has no opinion: the term is dropped).
- Term level only. What a *record* of a supported term supports (properties such as `DataField.Criticality`, `Chart.ChartType` values) and the manifest settings are not compared here; the known partial ones are in [deviations.md](deviations.md).

## Summary

| Vocabulary | Terms | Named in FE V4 docs | of those: supported | partial | ignored / missing | cds-htmx supported or partial (all terms) |
|---|---|---|---|---|---|---|
| UI | 61 | 43 | 25 | 1 | 17 | 27 |
| Common | 105 | 56 | 25 | 1 | 30 | 30 |
| Communication | 7 | 5 | 4 | 0 | 1 | 4 |
| Hierarchy | 4 | 2 | 1 | 1 | 0 | 2 |
| HTML5 | 3 | 3 | 1 | 0 | 2 | 1 |
| PersonalData | 7 | 2 | 0 | 0 | 2 | 0 |
| Session | 1 | 0 | 0 | 0 | 0 | 0 |
| Analytics | 10 | 2 | 0 | 0 | 2 | 0 |
| Capabilities | 40 | 9 | 7 | 0 | 2 | 10 |
| Core | 44 | 10 | 6 | 2 | 2 | 12 |
| Measures | 5 | 2 | 2 | 0 | 0 | 3 |
| Validation | 14 | 3 | 2 | 0 | 1 | 4 |
| Aggregation | 10 | 5 | 1 | 0 | 4 | 1 |

## Remaining work: named by FE V4 docs, not (fully) supported here

| Vocabulary | Term | FE V4 docs (files) | cds-htmx |
|---|---|---|---|
| UI | `Chart` | 48 | partial |
| UI (record) | `ChartMeasureAttributeType` | 24 | not in code |
| UI (record) | `ChartDefinitionType` | 23 | not in code |
| UI (record) | `Facet` | 17 | not in code |
| UI (record) | `ChartDimensionAttributeType` | 11 | not in code |
| Common | `SortOrder` | 10 | missing |
| UI | `CriticalityCalculation` | 9 | missing |
| UI (record) | `CriticalityCalculationType` | 9 | not in code |
| UI (record) | `SelectionRangeType` | 8 | not in code |
| UI (record) | `SelectOptionType` | 8 | not in code |
| Aggregation | `ApplySupported` | 8 | ignored |
| PersonalData | `IsPotentiallySensitive` | 7 | missing |
| UI | `QuickViewFacets` | 3 | ignored |
| UI (record) | `Parameter` | 3 | not in code |
| Common | `IsNaturalPerson` | 3 | missing |
| Communication | `Message` | 3 | missing |
| Hierarchy | `RecursiveHierarchyActions` | 3 | partial |
| Analytics | `AggregatedProperty` | 3 | ignored |
| Analytics | `Measure` | 3 | ignored |
| Core | `AcceptableMediaTypes` | 3 | missing |
| Core | `MediaType` | 3 | partial |
| Validation | `MaxItems` | 3 | missing |
| Aggregation | `CustomAggregate` | 3 | ignored |
| UI | `Emphasized` | 2 | missing |
| UI | `IsImage` | 2 | missing |
| UI | `ParameterDefaultValue` | 2 | missing |
| UI | `ValueCriticality` | 2 | missing |
| UI (record) | `DataFieldAbstract` | 2 | not in code |
| UI (record) | `DataFieldForActionGroup` | 2 | not in code |
| UI (record) | `ValueCriticalityType` | 2 | not in code |
| Common | `ExternalID` | 2 | missing |
| Common | `IsCalendarYearMonth` | 2 | missing |
| Common | `IsFiscalYear` | 2 | missing |
| Common | `IsFiscalYearPeriod` | 2 | missing |
| Common | `ReferentialConstraint` | 2 | missing |
| Common | `SecondaryKey` | 2 | missing |
| Common | `ValueListMapping` | 2 | missing |
| UI | `DataFieldDefault` | 1 | missing |
| UI | `DateTimeStyle` | 1 | missing |
| UI | `DoNotCheckScaleOfMeasuredQuantity` | 1 | missing |
| UI | `FilterFacets` | 1 | missing |
| UI | `InputMask` | 1 | missing |
| UI | `IsAIOperation` | 1 | missing |
| UI | `KPI` | 1 | ignored |
| UI | `MediaResource` | 1 | missing |
| UI | `OperationParameterFacets` | 1 | missing |
| UI | `Recommendations` | 1 | ignored |
| UI | `StatusInfo` | 1 | missing |
| UI (record) | `DataFieldWithActionGroup` | 1 | not in code |
| UI (record) | `InputMaskType` | 1 | not in code |
| UI (record) | `KPIDetailType` | 1 | not in code |
| UI (record) | `MediaResourceType` | 1 | not in code |
| Common | `CreatedAt` | 1 | missing |
| Common | `Interval` | 1 | missing |
| Common | `IsCalendarQuarter` | 1 | missing |
| Common | `IsCalendarWeek` | 1 | missing |
| Common | `IsCalendarYearQuarter` | 1 | missing |
| Common | `IsCalendarYearWeek` | 1 | missing |
| Common | `IsCurrency` | 1 | missing |
| Common | `IsDayOfFiscalYear` | 1 | missing |
| Common | `IsFiscalPeriod` | 1 | missing |
| Common | `IsFiscalQuarter` | 1 | missing |
| Common | `IsFiscalWeek` | 1 | missing |
| Common | `IsFiscalYearQuarter` | 1 | missing |
| Common | `IsFiscalYearWeek` | 1 | missing |
| Common | `IsUnit` | 1 | missing |
| Common | `RecursiveHierarchy` | 1 | missing |
| Common | `ResultContext` | 1 | missing |
| Common | `SAPObjectNodeType` | 1 | partial |
| Common | `UnitSpecificScale` | 1 | missing |
| Common | `ValueListReferences` | 1 | missing |
| Common | `ValueListShowValuesImmediately` | 1 | missing |
| Common | `WebSocketBaseURL` | 1 | missing |
| Common | `WebSocketChannel` | 1 | missing |
| HTML5 | `LinkTarget` | 1 | missing |
| HTML5 | `RowSpanForDuplicateValues` | 1 | missing |
| PersonalData | `IsPotentiallyPersonal` | 1 | missing |
| Capabilities | `FilterFunctions` | 1 | missing |
| Capabilities | `SupportedFormats` | 1 | missing |
| Core | `ContentDisposition` | 1 | missing |
| Core | `IsMediaType` | 1 | partial |
| Aggregation | `Aggregatable` | 1 | ignored |
| Aggregation | `Groupable` | 1 | ignored |

## UI  (`com.sap.vocabularies.UI.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `Chart` | 48 | partial |
| `ConnectedFields` | 2 | supported |
| `CreateHidden` | 3 | supported |
| `Criticality` | 16 | supported |
| `CriticalityCalculation` | 9 | missing |
| `DataFieldDefault` | 1 | missing |
| `DataPoint` | 33 | supported |
| `DateTimeStyle` | 1 | missing |
| `DeleteHidden` | 3 | supported |
| `DoNotCheckScaleOfMeasuredQuantity` | 1 | missing |
| `Emphasized` | 2 | missing |
| `ExcludeFromNavigationContext` | 2 | supported |
| `Facets` | 7 | supported |
| `FieldGroup` | 46 | supported |
| `FilterFacets` | 1 | missing |
| `HeaderFacets` | 8 | supported |
| `HeaderInfo` | 6 | supported |
| `Hidden` | 21 | supported |
| `HiddenFilter` | 5 | supported |
| `Identification` | 12 | supported |
| `Importance` | 19 | supported |
| `InputMask` | 1 | missing |
| `IsAIOperation` | 1 | missing |
| `IsCopyAction` | 2 | supported |
| `IsImage` | 2 | missing |
| `KPI` | 1 | ignored |
| `LineItem` | 97 | supported |
| `MediaResource` | 1 | missing |
| `MultiLineText` | 6 | supported |
| `OperationParameterFacets` | 1 | missing |
| `ParameterDefaultValue` | 2 | missing |
| `PartOfPreview` | 1 | supported |
| `Placeholder` | 2 | supported |
| `PresentationVariant` | 21 | supported |
| `QuickViewFacets` | 3 | ignored |
| `Recommendations` | 1 | ignored |
| `SelectionFields` | 18 | supported |
| `SelectionPresentationVariant` | 10 | supported |
| `SelectionVariant` | 14 | supported |
| `StatusInfo` | 1 | missing |
| `TextArrangement` | 8 | supported |
| `UpdateHidden` | 4 | supported |
| `ValueCriticality` | 2 | missing |
| `AdaptationHidden` | – | missing |
| `Badge` | – | ignored |
| `CardItem` | – | missing |
| `Contacts` | – | missing |
| `CriticalityLabels` | – | missing |
| `Gallery` | – | missing |
| `GeoLocation` | – | missing |
| `GeoLocations` | – | missing |
| `IsImageURL` | – | supported |
| `IsSummary` | – | missing |
| `LeadingEntitySet` | – | missing |
| `Map` | – | missing |
| `Note` | – | ignored |
| `OrderBy` | – | missing |
| `QuickCreateFacets` | – | ignored |
| `RecommendationList` | – | missing |
| `RecommendationState` | – | missing |
| `ThingPerspective` | – | missing |

### UI record types (`UI.*`)

| Type | FE V4 docs (files) | named in cds-htmx code |
|---|---|---|
| `ChartDefinitionType` | 23 | no |
| `ChartDimensionAttributeType` | 11 | no |
| `ChartMeasureAttributeType` | 24 | no |
| `CollectionFacet` | 4 | yes |
| `ConnectedFieldsType` | 2 | yes |
| `CriticalityCalculationType` | 9 | no |
| `DataField` | 40 | yes |
| `DataFieldAbstract` | 2 | no |
| `DataFieldForAction` | 24 | yes |
| `DataFieldForActionGroup` | 2 | no |
| `DataFieldForAnnotation` | 15 | yes |
| `DataFieldForIntentBasedNavigation` | 17 | yes |
| `DataFieldWithAction` | 2 | yes |
| `DataFieldWithActionGroup` | 1 | no |
| `DataFieldWithIntentBasedNavigation` | 7 | yes |
| `DataFieldWithNavigationPath` | 2 | yes |
| `DataFieldWithUrl` | 5 | yes |
| `DataPointType` | 33 | yes |
| `Facet` | 17 | no |
| `FieldGroupType` | 46 | yes |
| `HeaderInfoType` | 6 | yes |
| `InputMaskType` | 1 | no |
| `KPIDetailType` | 1 | no |
| `KPIType` | 1 | yes |
| `MediaResourceType` | 1 | no |
| `NumberFormat` | 3 | yes |
| `Parameter` | 3 | no |
| `PresentationVariantType` | 21 | yes |
| `ReferenceFacet` | 23 | yes |
| `SelectionPresentationVariantType` | 10 | yes |
| `SelectionRangeType` | 8 | no |
| `SelectionVariantType` | 14 | yes |
| `SelectOptionType` | 8 | no |
| `ValueCriticalityType` | 2 | no |
| `BadgeType` | – | yes |
| `CardItemType` | – | no |
| `ChartAxisAutoScaleBehaviorType` | – | no |
| `ChartAxisScalingType` | – | no |
| `CriticalityLabelType` | – | no |
| `CriticalityThresholdsType` | – | no |
| `DataFieldForActionAbstract` | – | no |
| `EmphasisLabelType` | – | no |
| `FixedScaleMultipleStackedMeasuresBoundaryValuesType` | – | no |
| `GeoLocationType` | – | no |
| `ImageType` | – | no |
| `InputMaskRuleType` | – | no |
| `IntervalParameter` | – | no |
| `LevelThresholdsType` | – | no |
| `NoteType` | – | yes |
| `ParameterAbstract` | – | no |
| `PropertyRecommendationType` | – | no |
| `RecommendationBinding` | – | no |
| `RecommendationListType` | – | no |
| `ReferencePeriod` | – | no |
| `ReferenceURLFacet` | – | no |
| `TrendCalculationType` | – | no |

## Common  (`com.sap.vocabularies.Common.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `CreatedAt` | 1 | missing |
| `DefaultValuesFunction` | 3 | supported |
| `DraftRoot` | 6 | supported |
| `ExternalID` | 2 | missing |
| `FieldControl` | 8 | supported |
| `FilterDefaultValue` | 3 | supported |
| `FilterExpressionRestrictions` | 1 | supported |
| `Interval` | 1 | missing |
| `IsActionCritical` | 2 | supported |
| `IsCalendarDate` | 2 | supported |
| `IsCalendarMonth` | 1 | supported |
| `IsCalendarQuarter` | 1 | missing |
| `IsCalendarWeek` | 1 | missing |
| `IsCalendarYear` | 1 | supported |
| `IsCalendarYearMonth` | 2 | missing |
| `IsCalendarYearQuarter` | 1 | missing |
| `IsCalendarYearWeek` | 1 | missing |
| `IsCurrency` | 1 | missing |
| `IsDayOfFiscalYear` | 1 | missing |
| `IsDigitSequence` | 1 | supported |
| `IsFiscalPeriod` | 1 | missing |
| `IsFiscalQuarter` | 1 | missing |
| `IsFiscalWeek` | 1 | missing |
| `IsFiscalYear` | 2 | missing |
| `IsFiscalYearPeriod` | 2 | missing |
| `IsFiscalYearQuarter` | 1 | missing |
| `IsFiscalYearWeek` | 1 | missing |
| `IsNaturalPerson` | 3 | missing |
| `IsUnit` | 1 | missing |
| `Label` | 22 | supported |
| `Masked` | 2 | supported |
| `Messages` | 1 | supported |
| `QuickInfo` | 2 | supported |
| `RecursiveHierarchy` | 1 | missing |
| `ReferentialConstraint` | 2 | missing |
| `ResultContext` | 1 | missing |
| `SAPObjectNodeType` | 1 | partial |
| `SecondaryKey` | 2 | missing |
| `SemanticKey` | 4 | supported |
| `SemanticObject` | 9 | supported |
| `SemanticObjectMapping` | 3 | supported |
| `SemanticObjectUnavailableActions` | 4 | supported |
| `SideEffects` | 11 | supported |
| `SortOrder` | 10 | missing |
| `Text` | 8 | supported |
| `Timezone` | 1 | supported |
| `UnitSpecificScale` | 1 | missing |
| `ValueList` | 8 | supported |
| `ValueListForValidation` | 2 | supported |
| `ValueListMapping` | 2 | missing |
| `ValueListReferences` | 1 | missing |
| `ValueListRelevantQualifiers` | 3 | supported |
| `ValueListShowValuesImmediately` | 1 | missing |
| `ValueListWithFixedValues` | 4 | supported |
| `WebSocketBaseURL` | 1 | missing |
| `WebSocketChannel` | 1 | missing |
| `AddressViaNavigationPath` | – | ignored |
| `Application` | – | missing |
| `ApplyMultiUnitBehaviorForSortingAndFiltering` | – | missing |
| `AssociationEntity` | – | missing |
| `Attributes` | – | missing |
| `ChangedAt` | – | missing |
| `ChangedBy` | – | missing |
| `Composition` | – | missing |
| `CreatedBy` | – | missing |
| `DerivedDefaultValue` | – | missing |
| `DerivedFilterDefaultValue` | – | missing |
| `DerivedNavigation` | – | missing |
| `DocumentationRef` | – | missing |
| `DraftActivationVia` | – | missing |
| `DraftNode` | – | supported |
| `EditableFieldFor` | – | missing |
| `ErrorResolution` | – | missing |
| `ExceptionCategory` | – | missing |
| `ExpandAfterConcatSupported` | – | missing |
| `Experimental` | – | missing |
| `FilterDefaultValueHigh` | – | missing |
| `Heading` | – | supported |
| `IsCalendarHalfyear` | – | missing |
| `IsCalendarYearHalfyear` | – | missing |
| `IsDayOfCalendarMonth` | – | missing |
| `IsDayOfCalendarYear` | – | missing |
| `IsFiscalYearVariant` | – | missing |
| `IsInstanceAnnotation` | – | missing |
| `IsLanguageIdentifier` | – | missing |
| `IsTimezone` | – | missing |
| `IsUpperCase` | – | supported |
| `MaskedValue` | – | missing |
| `MaximumNumericMessageSeverity` | – | missing |
| `MaxOccurs` | – | missing |
| `MinOccurs` | – | missing |
| `MutuallyExclusiveTerm` | – | missing |
| `OperationTemplate` | – | missing |
| `OriginalProtocolVersion` | – | missing |
| `PrimitivePropertyPath` | – | missing |
| `RelatedRecursiveHierarchy` | – | missing |
| `RevealOnDemand` | – | missing |
| `SAPObjectNodeTypeReference` | – | missing |
| `ServiceSchemaVersion` | – | missing |
| `ServiceVersion` | – | missing |
| `TextFor` | – | supported |
| `TextFormat` | – | missing |
| `Timestamp` | – | missing |
| `TransactionId` | – | missing |
| `UnitSpecificPrecision` | – | missing |

## Communication  (`com.sap.vocabularies.Communication.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `Address` | 2 | supported |
| `Contact` | 7 | supported |
| `IsEmailAddress` | 2 | supported |
| `IsPhoneNumber` | 2 | supported |
| `Message` | 3 | missing |
| `Event` | – | missing |
| `Task` | – | missing |

## Hierarchy  (`com.sap.vocabularies.Hierarchy.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `RecursiveHierarchy` | 2 | supported |
| `RecursiveHierarchyActions` | 3 | partial |
| `MatchCount` | – | missing |
| `RecursiveHierarchySupported` | – | missing |

## HTML5  (`com.sap.vocabularies.HTML5.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `CssDefaults` | 2 | supported |
| `LinkTarget` | 1 | missing |
| `RowSpanForDuplicateValues` | 1 | missing |

## PersonalData  (`com.sap.vocabularies.PersonalData.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `IsPotentiallyPersonal` | 1 | missing |
| `IsPotentiallySensitive` | 7 | missing |
| `DataSubjectRole` | – | missing |
| `DataSubjectRoleDescription` | – | missing |
| `EntitySemantics` | – | missing |
| `FieldSemantics` | – | missing |
| `RelatedDataCategoryID` | – | missing |

## Session  (`com.sap.vocabularies.Session.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `StickySessionSupported` | – | ignored |

## Analytics  (`com.sap.vocabularies.Analytics.v1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `AggregatedProperty` | 3 | ignored |
| `Measure` | 3 | ignored |
| `AccumulativeMeasure` | – | ignored |
| `AggregatedProperties` | – | ignored |
| `AnalyticalContext` | – | ignored |
| `Dimension` | – | ignored |
| `DrillURL` | – | ignored |
| `LevelInformation` | – | ignored |
| `PlanningAction` | – | ignored |
| `RolledUpPropertyCount` | – | ignored |

## Capabilities  (`Org.OData.Capabilities.V1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `DeleteRestrictions` | 2 | supported |
| `FilterFunctions` | 1 | missing |
| `FilterRestrictions` | 6 | supported |
| `InsertRestrictions` | 7 | supported |
| `NavigationRestrictions` | 9 | supported |
| `SearchRestrictions` | 2 | supported |
| `SortRestrictions` | 1 | supported |
| `SupportedFormats` | 1 | missing |
| `UpdateRestrictions` | 6 | supported |
| `AcceptableEncodings` | – | missing |
| `AnnotationValuesInQuerySupported` | – | missing |
| `AsynchronousRequestsSupported` | – | missing |
| `BatchContinueOnErrorSupported` | – | missing |
| `BatchSupport` | – | missing |
| `BatchSupported` | – | missing |
| `CallbackSupported` | – | missing |
| `ChangeTracking` | – | missing |
| `CollectionPropertyRestrictions` | – | missing |
| `ComputeSupported` | – | missing |
| `ConformanceLevel` | – | missing |
| `CountRestrictions` | – | supported |
| `CrossJoinSupported` | – | missing |
| `CustomHeaders` | – | missing |
| `CustomQueryOptions` | – | missing |
| `DeepInsertSupport` | – | missing |
| `DeepUpdateSupport` | – | missing |
| `DefaultCapabilities` | – | missing |
| `ExpandRestrictions` | – | missing |
| `IndexableByKey` | – | missing |
| `IsolationSupported` | – | missing |
| `KeyAsSegmentSupported` | – | missing |
| `MediaLocationUpdateSupported` | – | missing |
| `ModificationQueryOptions` | – | missing |
| `OperationRestrictions` | – | missing |
| `QuerySegmentSupported` | – | missing |
| `ReadRestrictions` | – | missing |
| `SelectSupport` | – | missing |
| `SkipSupported` | – | supported |
| `SupportedMetadataFormats` | – | missing |
| `TopSupported` | – | supported |

## Core  (`Org.OData.Core.V1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `AcceptableMediaTypes` | 3 | missing |
| `Computed` | 4 | supported |
| `ComputedDefaultValue` | 1 | supported |
| `ContentDisposition` | 1 | missing |
| `Description` | 2 | supported |
| `Immutable` | 2 | supported |
| `IsMediaType` | 1 | partial |
| `IsURL` | 1 | supported |
| `MediaType` | 3 | partial |
| `OperationAvailable` | 9 | supported |
| `AdditionalProperties` | – | missing |
| `AlternateKeys` | – | missing |
| `AnyStructure` | – | missing |
| `AppliesViaContainer` | – | missing |
| `AutoExpand` | – | missing |
| `AutoExpandReferences` | – | missing |
| `ContentID` | – | missing |
| `ConventionalIDs` | – | missing |
| `DataModificationException` | – | missing |
| `DefaultNamespace` | – | missing |
| `DereferenceableIDs` | – | missing |
| `Example` | – | missing |
| `ExplicitOperationBindings` | – | missing |
| `GeometryFeature` | – | missing |
| `IsDelta` | – | missing |
| `IsLanguageDependent` | – | missing |
| `Links` | – | partial |
| `LongDescription` | – | supported |
| `MayImplement` | – | missing |
| `Messages` | – | missing |
| `ODataVersions` | – | missing |
| `OptimisticConcurrency` | – | partial |
| `OptionalParameter` | – | missing |
| `Ordered` | – | missing |
| `Permissions` | – | partial |
| `PositionalInsert` | – | missing |
| `RequiresExplicitBinding` | – | missing |
| `RequiresType` | – | missing |
| `ResourceException` | – | missing |
| `ResourcePath` | – | missing |
| `Revisions` | – | missing |
| `SchemaVersion` | – | missing |
| `SymbolicName` | – | missing |
| `ValueException` | – | missing |

## Measures  (`Org.OData.Measures.V1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `ISOCurrency` | 5 | supported |
| `Unit` | 3 | supported |
| `DurationGranularity` | – | missing |
| `Scale` | – | supported |
| `UNECEUnit` | – | missing |

## Validation  (`Org.OData.Validation.V1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `Maximum` | 1 | supported |
| `MaxItems` | 3 | missing |
| `Minimum` | 1 | supported |
| `AllowedTerms` | – | missing |
| `AllowedValues` | – | supported |
| `ApplicableTerms` | – | missing |
| `Constraint` | – | missing |
| `DerivedTypeConstraint` | – | missing |
| `Exclusive` | – | missing |
| `ItemsOf` | – | missing |
| `MinItems` | – | missing |
| `MultipleOf` | – | missing |
| `OpenPropertyTypeConstraint` | – | missing |
| `Pattern` | – | supported |

## Aggregation  (`Org.OData.Aggregation.V1`)

| Term | FE V4 docs (files) | cds-htmx |
|---|---|---|
| `Aggregatable` | 1 | ignored |
| `ApplySupported` | 8 | ignored |
| `CustomAggregate` | 3 | ignored |
| `Groupable` | 1 | ignored |
| `RecursiveHierarchy` | 1 | supported |
| `ApplySupportedDefaults` | – | ignored |
| `AvailableOnAggregates` | – | ignored |
| `ContextDefiningProperties` | – | ignored |
| `LeveledHierarchy` | – | ignored |
| `UpPath` | – | ignored |
