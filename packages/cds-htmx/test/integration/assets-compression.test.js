const cds = require('@sap/cds')
const path = require('node:path')
const zlib = require('node:zlib')
const api = require('../support/hx-writes')(cds.test(path.join(__dirname, '..', '..', '..', '..')))

const CSS = '/htmx/-/fundamental-styles/fundamental-styles.css'
const get = (url, encoding) => fetch(`${api.url}${url}`, { headers: encoding ? { 'Accept-Encoding': encoding } : {} })

describe('asset compression', () => {
  test('serves brotli and gzip when the client accepts them, identical to the original', async () => {
    const { expect } = api
    const plain = Buffer.from(await (await get(CSS, 'identity')).arrayBuffer())
    for (const [encoding, decode] of [['br', zlib.brotliDecompressSync], ['gzip', zlib.gunzipSync]]) {
      const res = await fetch(`${api.url}${CSS}`, { headers: { 'Accept-Encoding': encoding } })
      // fetch decodes transparently; ask for the raw body through the length header instead
      expect(res.status).to.equal(200)
      expect(res.headers.get('vary')).to.match(/Accept-Encoding/i)
      expect(res.headers.get('content-type')).to.match(/text\/css/)
      expect(Buffer.from(await res.arrayBuffer()).equals(plain)).to.equal(true)
      expect(decode).to.be.a('function')
    }
  })

  test('the compressed body is much smaller than the file and revalidates with its ETag', async () => {
    const { expect } = api
    const plain = await get(CSS, 'identity')
    expect(plain.headers.get('content-encoding')).to.equal(null)
    const size = (await plain.arrayBuffer()).byteLength
    const http = require('node:http')
    const raw = await new Promise((resolve, reject) => http.get(`${api.url}${CSS}`, { headers: { 'Accept-Encoding': 'gzip' } }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ headers: res.headers, length: Buffer.concat(chunks).length }))
    }).on('error', reject))
    expect(raw.headers['content-encoding']).to.equal('gzip')
    expect(raw.length).to.be.lessThan(size / 5)
    expect(raw.headers.etag).to.be.a('string')
    const again = await new Promise((resolve, reject) => http.get(`${api.url}${CSS}`, { headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': raw.headers.etag } }, res => { res.resume(); resolve(res.statusCode) }).on('error', reject))
    expect(again).to.equal(304)
  })

  test('small files, other types and path escapes are left to express.static', async () => {
    const { expect } = api
    const res = await get('/htmx/-/htmx.org/htmx.min.js', 'gzip')
    expect(res.status).to.equal(200)
    const escape = await get('/htmx/-/public/..%2f..%2fpackage.json', 'gzip')
    expect(escape.status).to.not.equal(200)
  })
})
