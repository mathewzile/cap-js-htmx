// Themes: Horizon light, dark and the two high contrast ones; `auto` follows the browser. In the launchpad the theme is the user's
// (cds-htmx-shell, flp adapter); that part needs a launchpad and is covered by the shell's own mapping test below.
const cds = require('@sap/cds')
const path = require('node:path')
const assert = require('node:assert/strict')
const { GET } = cds.test(path.join(__dirname, '..', '..', '..', '..'))
const layout = require('../../lib/render/layout')

const withTheme = async (theme, fn) => {
  const before = cds.env.htmx
  cds.env.htmx = { ...before, theme }
  try { return await fn() } finally { cds.env.htmx = before }
}
const head = theme => withTheme(theme, () => String(layout.page({ title: 't', body: '' })))

describe('theme', () => {
  test('a configured theme is the only one loaded', async () => {
    const page = await head('sap_horizon_dark')
    assert.match(page, /baseLib\/sap_horizon_dark\/css_variables\.css">/)
    assert.match(page, /theming\/sap_horizon_dark\.css">/)
    assert.doesNotMatch(page, /baseLib\/sap_horizon\/|theming\/sap_horizon\.css|prefers-color-scheme/)
  })

  test('auto loads light and dark, each for the browser preference it answers to', async () => {
    const page = await head('auto')
    assert.match(page, /baseLib\/sap_horizon\/css_variables\.css" media="\(prefers-color-scheme: light\)"/)
    assert.match(page, /theming\/sap_horizon\.css" media="\(prefers-color-scheme: light\)"/)
    assert.match(page, /baseLib\/sap_horizon_dark\/css_variables\.css" media="\(prefers-color-scheme: dark\)"/)
    assert.match(page, /theming\/sap_horizon_dark\.css" media="\(prefers-color-scheme: dark\)"/)
  })

  test('an unknown theme falls back to Horizon instead of leaving the page unstyled', async () => {
    assert.match(await head('sap_nonsense'), /baseLib\/sap_horizon\/css_variables\.css"/)
  })

  test('every theme the plugin names has its stylesheets served', async () => {
    const info = (await GET('/htmx/catalog/$shell', { headers: { 'HX-Request': 'true' } })).data
    for (const name of ['sap_horizon', 'sap_horizon_dark', 'sap_horizon_hcb', 'sap_horizon_hcw']) {
      assert.equal((await GET(info.themes[name])).status, 200, name)
      assert.equal((await GET(info.variables[name])).status, 200, name)
    }
  })

  test('$shell answers for auto: light to start from, the shell decides from the browser', async () => {
    const info = await withTheme('auto', async () => (await GET('/htmx/catalog/$shell', { headers: { 'HX-Request': 'true' } })).data)
    assert.equal(info.auto, true)
    assert.equal(info.theme, 'sap_horizon')
    const fixed = (await GET('/htmx/catalog/$shell', { headers: { 'HX-Request': 'true' } })).data
    assert.equal(fixed.auto, false)
  })
})
