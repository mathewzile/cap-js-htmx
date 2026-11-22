/** Common vocabulary term coverage (§3.2). */
module.exports = {
  Label: 'supported',
  Heading: 'supported',
  QuickInfo: 'supported',
  Text: 'supported',
  TextFor: 'supported',
  SemanticKey: 'supported',
  FieldControl: 'supported',
  ValueList: 'supported',
  ValueListWithFixedValues: 'supported',
  ValueListRelevantQualifiers: 'supported',
  ValueListForValidation: 'supported',
  SideEffects: 'supported',
  Messages: 'supported',
  IsActionCritical: 'supported',
  DefaultValuesFunction: 'supported',
  FilterDefaultValue: 'supported',
  FilterExpressionRestrictions: 'supported',
  DraftRoot: 'supported',
  DraftNode: 'supported',
  IsUpperCase: 'supported',
  IsDigitSequence: 'supported',
  IsCalendarDate: 'supported',
  IsCalendarYear: 'supported',
  IsCalendarMonth: 'supported',
  Masked: 'supported',
  Timezone: 'supported',
  SemanticObject: 'supported', // a link on the value; the popover lists the launchpad's targets (`getLinks`)
  SemanticObjectMapping: 'supported', // the name the property is passed under to the target
  SemanticObjectUnavailableActions: 'supported', // actions of the object the popover does not offer
  SAPObjectNodeType: 'partial',
  // CAP-auto-injected, EntityContainer-level addressing hint; no layout effect.
  AddressViaNavigationPath: 'ignored'
}
