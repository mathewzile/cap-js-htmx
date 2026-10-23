// Packages a cds-htmx frontend project as an HTML5 application zip for the HTML5 Application Repository:
//   node build-app.mjs <app folder>
// <app folder> has webapp/ (manifest.json, Component.js, index.html, annotations/, i18n/ ...) and xs-app.json. The zip holds the
// webapp files, the generic shell under shell/ (the component's `cds.htmx.shell` resource root) and xs-app.json at its root, and
// is written to <app folder>/dist/<app id>.zip (a folder with the same files, unzipped, is left beside it for inspection).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const appDir = path.resolve(process.argv[2] || '.')
const shellDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shell')
const webapp = path.join(appDir, 'webapp')
const manifest = JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const id = manifest['sap.app'].id

for (const [what, ok] of [
  ['sap.cloud.service in manifest.json (the launchpad addresses the app by it)', !!manifest['sap.cloud']?.service],
  ['sap.htmx.service and sap.htmx.entry in manifest.json', !!(manifest['sap.htmx']?.service && manifest['sap.htmx']?.entry)],
  ['xs-app.json', fs.existsSync(path.join(appDir, 'xs-app.json'))]
]) if (!ok) { console.error(`${path.basename(appDir)}: missing ${what}`); process.exit(1) }

const out = path.join(appDir, 'dist')
const staging = path.join(out, 'app')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(staging, { recursive: true })
fs.cpSync(webapp, staging, { recursive: true, filter: file => !/[\\/]test([\\/]|$)/.test(file) })
fs.cpSync(shellDir, path.join(staging, 'shell'), { recursive: true })
fs.copyFileSync(path.join(appDir, 'xs-app.json'), path.join(staging, 'xs-app.json'))

const zip = new AdmZip()
zip.addLocalFolder(staging)
const target = path.join(out, `${id.replace(/[^\w]/g, '')}.zip`)
zip.writeZip(target)
console.log(`${path.relative(process.cwd(), target)}  (${zip.getEntries().length} files, ${(fs.statSync(target).size / 1024).toFixed(0)} KB)`)
