import cds from '@sap/cds/eslint.config.mjs'

const browser = Object.fromEntries(['window', 'document', 'navigator', 'history', 'location', 'CustomEvent', 'sap'].map(name => [name, 'readonly']))

export default [
  ...cds.recommended,
  // the scripts that run in the browser (the shell, and `sap` is UI5 in a launchpad)
  { files: ['packages/cds-htmx-shell/shell/**/*.js', 'packages/cds-htmx/public/**/*.js'], languageOptions: { globals: browser } }
]
