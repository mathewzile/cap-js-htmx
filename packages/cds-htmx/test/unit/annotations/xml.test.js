const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { parseAnnotationXml, parseAnnotationXmlFile } = require('../../../lib/annotations/xml')

test('parses the manage-books annotation.xml fixture into CSDL-JSON-shaped $Annotations', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', '..', 'app', 'manage-books', 'webapp', 'annotations', 'annotation.xml')
  const { $Annotations } = parseAnnotationXmlFile(file)
  const books = $Annotations['CatalogService.Books']

  const lineItem = books['@UI.LineItem']
  assert.equal(lineItem.length, 5)
  assert.deepEqual(lineItem[0], { '@type': 'UI.DataField', Value: { $Path: 'title' }, Label: 'Book Title (XML override)' })
  assert.deepEqual(lineItem[1].Criticality, { $Path: 'stockCriticality' })
  assert.deepEqual(lineItem[3].Value, { $Path: 'author/name' })

  const extra = books['@UI.FieldGroup#Extra']
  assert.equal(extra['@type'], 'UI.FieldGroupType')
  assert.equal(extra.Data.length, 2)
  assert.deepEqual(extra.Data[0].Value, { $Path: 'rating' })

  const facets = books['@UI.Facets']
  assert.equal(facets.length, 5)
  assert.equal(facets[0].Target, '@UI.FieldGroup#General')
  assert.equal(facets[3].Target, 'chapters/@UI.LineItem')
  assert.equal(facets[4].ID, 'ExtraInfo')
})

test('attribute shortcuts: String, Bool, Int, Decimal, EnumMember, PropertyPath/NavigationPropertyPath/AnnotationPath', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0">
  <edmx:Reference Uri="x"><edmx:Include Namespace="com.sap.vocabularies.UI.v1" Alias="UI"/></edmx:Reference>
  <edmx:Reference Uri="x"><edmx:Include Namespace="com.sap.vocabularies.Common.v1" Alias="Common"/></edmx:Reference>
  <edmx:DataServices>
    <Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="local">
      <Annotations Target="CatalogService.Books/stock">
        <Annotation Term="Common.FieldControl" EnumMember="com.sap.vocabularies.Common.v1.FieldControlType/Mandatory"/>
        <Annotation Term="UI.Hidden" Bool="true"/>
        <Annotation Term="Validation.Minimum" Int="0"/>
      </Annotations>
      <Annotations Target="CatalogService.Books">
        <Annotation Term="Common.ValueList">
          <Record Type="Common.ValueListType">
            <PropertyValue Property="CollectionPath" String="Authors"/>
            <PropertyValue Property="Parameters">
              <Collection>
                <Record Type="Common.ValueListParameterInOut">
                  <PropertyValue Property="LocalDataProperty" PropertyPath="author_ID"/>
                  <PropertyValue Property="ValueListProperty" String="ID"/>
                </Record>
              </Collection>
            </PropertyValue>
          </Record>
        </Annotation>
      </Annotations>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

  const { $Annotations } = parseAnnotationXml(xml)
  const stock = $Annotations['CatalogService.Books/stock']
  assert.equal(stock['@Common.FieldControl'], 'Mandatory')
  assert.equal(stock['@UI.Hidden'], true)
  assert.equal(stock['@Validation.Minimum'], 0)

  const valueList = $Annotations['CatalogService.Books']['@Common.ValueList']
  assert.equal(valueList['@type'], 'Common.ValueListType')
  assert.equal(valueList.CollectionPath, 'Authors')
  assert.equal(valueList.Parameters[0].LocalDataProperty, 'author_ID')
})

test('qualifiers produce distinct #Qualifier keys on the same target', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx" Version="4.0">
  <edmx:Reference Uri="x"><edmx:Include Namespace="com.sap.vocabularies.UI.v1" Alias="UI"/></edmx:Reference>
  <edmx:DataServices>
    <Schema xmlns="http://docs.oasis-open.org/odata/ns/edm" Namespace="local">
      <Annotations Target="CatalogService.Books">
        <Annotation Term="UI.FieldGroup" Qualifier="A"><Record Type="UI.FieldGroupType"/></Annotation>
        <Annotation Term="UI.FieldGroup" Qualifier="B"><Record Type="UI.FieldGroupType"/></Annotation>
      </Annotations>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`
  const { $Annotations } = parseAnnotationXml(xml)
  const books = $Annotations['CatalogService.Books']
  assert.ok(books['@UI.FieldGroup#A'])
  assert.ok(books['@UI.FieldGroup#B'])
})
