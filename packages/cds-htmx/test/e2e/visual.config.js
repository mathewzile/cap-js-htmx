const { defineConfig } = require('@playwright/test')
const base = require('./playwright.config.js')

/** Visual parity run (`npm run test:visual`): the real Fiori elements apps next to the htmx ones, screenshots only.
 *  Separate from the default e2e run because the FE apps load UI5 from the CDN. */
module.exports = defineConfig({
  ...base,
  testMatch: '*.visual.js',
  timeout: 180000,
  use: { ...base.use, deviceScaleFactor: 1 }
})
