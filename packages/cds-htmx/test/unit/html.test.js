const assert = require('node:assert/strict')
const { test } = require('node:test')
const { html, raw, escape } = require('../../lib/render/html')

test('escape() neutralizes all five XML-significant characters', () => {
  assert.equal(escape(`<script>alert('x')</script> & "quoted"`),
    '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;')
  assert.equal(escape(null), '')
  assert.equal(escape(undefined), '')
  assert.equal(escape(42), '42')
})

test('html`` auto-escapes interpolated values', () => {
  const userInput = '<img src=x onerror=alert(1)>'
  const out = html`<div>${userInput}</div>`
  assert.equal(String(out), '<div>&lt;img src=x onerror=alert(1)&gt;</div>')
})

test('html`` does not escape raw() values, allowing nested fragments', () => {
  const inner = html`<b>${'bold'}</b>`
  const out = html`<div>${raw(String(inner))}</div>`
  assert.equal(String(out), '<div><b>bold</b></div>')
})

test('html`` flattens and escapes arrays of values (e.g. mapped rows)', () => {
  const items = ['<a>', '<b>']
  const out = html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`
  assert.equal(String(out), '<ul><li>&lt;a&gt;</li><li>&lt;b&gt;</li></ul>')
})
