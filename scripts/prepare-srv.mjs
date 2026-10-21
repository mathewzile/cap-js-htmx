// Completes `gen/srv` (what `cds build --production` wrote) so it runs on Cloud Foundry on its own:
//  1. the cds-htmx plugin is a workspace package, not on a registry: it is packed into gen/srv/vendor and referenced as a file
//  2. the frontend apps' manifests, annotation.xml and i18n files are copied to gen/srv/app: the plugin lays pages out from them
//     (the `local` app source, and the manifest page settings), and the model's texts live in app/_i18n
//  3. package.json is reduced to what runs: production dependencies, `start`, no workspaces, no lock file (the workspace lock
//     file does not fit this folder)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const srv = path.join(root, 'gen', 'srv')
if (!fs.existsSync(path.join(srv, 'package.json'))) throw new Error('gen/srv is missing: run `npx cds build --production` first')

// 1. the plugin
const vendor = path.join(srv, 'vendor')
fs.rmSync(vendor, { recursive: true, force: true })
fs.mkdirSync(vendor, { recursive: true })
const packed = execFileSync('npm', ['pack', '--workspace', 'cds-htmx', '--pack-destination', vendor, '--json'], { cwd: root, shell: process.platform === 'win32', encoding: 'utf8' })
const tarball = JSON.parse(packed)[0].filename

// 2. what the plugin reads at run time from app/
const appRoot = path.join(root, 'app')
for (const name of fs.readdirSync(appRoot)) {
  const webapp = path.join(appRoot, name, 'webapp')
  if (!fs.existsSync(path.join(webapp, 'manifest.json'))) continue
  for (const file of ['manifest.json', 'annotations', 'i18n']) {
    if (fs.existsSync(path.join(webapp, file))) fs.cpSync(path.join(webapp, file), path.join(srv, 'app', name, 'webapp', file), { recursive: true })
  }
}
if (fs.existsSync(path.join(appRoot, '_i18n'))) fs.cpSync(path.join(appRoot, '_i18n'), path.join(srv, 'app', '_i18n'), { recursive: true })

// 3. package.json
const pkgFile = path.join(srv, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
pkg.dependencies = { ...pkg.dependencies, ...rootPkg.dependencies, 'cds-htmx': `file:vendor/${tarball}` }
delete pkg.devDependencies
delete pkg.workspaces
pkg.scripts = { start: 'cds-serve' }
pkg.engines = { node: '>=22' }
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
fs.rmSync(path.join(srv, 'package-lock.json'), { force: true })

console.log(`gen/srv ready: plugin ${tarball}, app manifests for ${fs.readdirSync(path.join(srv, 'app')).join(', ')}`)
