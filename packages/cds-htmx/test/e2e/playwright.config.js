const { defineConfig } = require('@playwright/test')
const path = require('node:path')

/** Browser tests against the real app (`cds serve` of the repo root). Uses the installed Edge on Windows
 *  (no browser download needed); set PW_CHANNEL to pick another installed browser, or leave it unset on
 *  Linux/CI to use Playwright's own Chromium. One worker: the tests share the in-memory database. */
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.js',
  timeout: 60000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4004',
    channel: process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: 'npx cds serve',
    cwd: path.join(__dirname, '..', '..', '..', '..'),
    url: 'http://localhost:4004/',
    env: { ...process.env, CDS_HTMX_THEME: 'auto' }, // light or dark as the browser prefers; the specs pick with colorScheme
    reuseExistingServer: true, // a running dev server is used as it is (the dark specs skip themselves unless it has theme auto)
    timeout: 120000
  }
})
