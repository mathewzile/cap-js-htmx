const fs = require('fs')
function patch(p, fn) {
  const raw = fs.readFileSync(p, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')
  const rep = (a, b) => { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 90)); s = s.replace(a, () => b) }
  const cut = (from, to, replacement = '') => {
    const i = s.indexOf(from)
    const j = s.indexOf(to, i + 1)
    if (i < 0 || j < 0) throw new Error(p + ' cut: ' + from.slice(0, 60))
    s = s.slice(0, i) + replacement + s.slice(j)
  }
  fn(rep, cut, () => s)
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
}

patch('packages/cds-htmx/lib/data/form.js', (rep, cut) => {
  rep("const { resolveElement } = require('../annotations/edm')\nconst { isReadOnly } = require('../render/field')\nconst { collectFormFields } = require('./page')\n\n", "")
  cut("/** The values to store for a submitted edit form:", "module.exports", "")
  rep("module.exports = { formValues, coerce, InputError, invalidValueListKeys, childRowValues }", "module.exports = { coerce, InputError }")
})

patch('packages/cds-htmx/lib/render/table.js', (rep, cut) => {
  cut("/** A row of a composition table in a non-draft Object Page that is being edited (direct edit / create)", "function rowMarkup(", "")
  rep("  if (edit?.direct) return directRowMarkup(layout, row, { keyNames, bundle, t, numeric, edit })\n", "")
  rep("rows.map((row, index) => rowMarkup(layout, row, { basePath, entitySetPath, keyNames, bundle, t, numeric, selectable, edit: edit?.direct ? { index, ...edit } : edit }))", "rows.map(row => rowMarkup(layout, row, { basePath, entitySetPath, keyNames, bundle, t, numeric, selectable, edit }))")
})

patch('packages/cds-htmx/lib/render/object-page.js', (rep, cut, get) => {
  rep("  // A composition of a non-draft object being edited/created: rows are plain inputs saved with the object\n  const direct = !ctx.isDraft && (ctx.editMode === 'direct' || ctx.editMode === 'create') && !!facet.content.composition\n  const editing = !!ctx.isDraft || direct\n", "  const editing = !!ctx.isDraft\n")
  rep("  const edit = direct ? { direct: true, nav }\n    : editing ? { nav, rowPath: row => rowHref(ctx.basePath, entitySetPath, keyNames, row) } : undefined", "  const edit = editing ? { nav, rowPath: row => rowHref(ctx.basePath, entitySetPath, keyNames, row) } : undefined")
  cut("      ${direct ? html`\n        <button type=\"button\" class=\"fd-button fd-button--transparent\" data-hf-action=\"row-add\">", "        <button class=\"fd-button fd-button--transparent\" hx-post=\"${ctx.basePath}/${ctx.entitySetPath}/${nav}\"", "      ${editing ? html`\n")
  rep("`` : html``}\n      <span class=\"hf-toolbar-separator\"></span>", "`` : html``}\n      <span class=\"hf-toolbar-separator\"></span>")
  rep("${editing && !direct ? html`<button type=\"button\"", "${editing ? html`<button type=\"button\"")
  cut("\n    ${direct ? html`\n      <input type=\"hidden\" name=\"${nav}:present\"", "\n}\n\n/** The single label/value block", "`")
})
