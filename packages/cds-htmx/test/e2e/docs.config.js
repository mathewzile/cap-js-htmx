const { defineConfig } = require('@playwright/test')
const base = require('./playwright.config.js')

/** The documentation screenshots (`npm run docs:screenshots`): writes docs/images, so it is not part of the default run. */
module.exports = defineConfig({ ...base, testMatch: '*.shots.js' })
