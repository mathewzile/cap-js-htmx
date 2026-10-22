// Work Zone (and any CSP without 'unsafe-eval') blocks `new Function`, which htmx uses for bracketed hx-trigger
// filters and js: expressions. Nothing we render or ship may reach it.
const cds = require('@sap/cds')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { GET } = cds.test(path.join(__dirname, '..', '..', '..', '..'))

const HX = { 'HX-Request': 'true' }
const EVAL_ATTRS = [
  ['bracketed hx-trigger filter', /hx-trigger\s*=\s*["'][^"']*\[/],
  ['hx-on handler', /\bhx-on[:\w-]*\s*=/],
  ['js: expression', /\b(?:hx-vals|hx-headers|hx-confirm|hx-config)[^=]*=\s*["']\s*js:/],
  ['javascript: action', /\bhx-(?:get|post|put|patch|delete|action)\s*=\s*["']\s*javascript:/]
]
const offences = html => EVAL_ATTRS.filter(([, re]) => re.test(html)).map(([name]) => name)

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])

describe('CSP: no unsafe-eval paths', () => {
  test('render sources and shell templates declare no eval-backed htmx attributes', () => {
    const lib = path.join(__dirname, '..', '..', 'lib', 'render')
    const shell = path.join(__dirname, '..', '..', '..', 'cds-htmx-shell')
    const files = [...walk(lib), ...walk(shell).filter(f => /\.(html|js)$/.test(f) && !/node_modules/.test(f))]
    for (const f of files) assert.deepEqual(offences(fs.readFileSync(f, 'utf8')), [], f)
  })

  for (const url of ['/htmx/admin/Books', '/htmx/admin/Genres', '/htmx/admin/Authors', '/htmx/catalog/Books']) {
    test(`rendered ${url} (page and table fragment) has none`, async () => {
      for (const headers of [{}, HX]) {
        const { data } = await GET(url, { headers })
        assert.deepEqual(offences(String(data)), [], url)
      }
    })
  }

  test('table rows use a plain click trigger', async () => {
    const { data } = await GET('/htmx/admin/Books/$table', { headers: HX })
    assert.match(String(data), /<tr id="[^"]*"[^>]*hx-trigger="click"/s)
  })
})
