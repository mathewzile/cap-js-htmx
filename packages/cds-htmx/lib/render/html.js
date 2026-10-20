const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c])

class Raw {
  constructor(value) { this.value = value }
  toString() { return this.value }
}

const raw = value => new Raw(value)

function html(strings, ...values) {
  let out = strings[0]
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    out += Array.isArray(v)
      ? v.map(each => each instanceof Raw ? each.value : escape(each)).join('')
      : v instanceof Raw ? v.value : escape(v)
    out += strings[i + 1]
  }
  return raw(out)
}

module.exports = { html, raw, escape, Raw }
