const { html, raw } = require('./html')

/** `UI.Chart` as inline SVG (no script, no `sap.viz`): the chart types of the annotation that matter on an Object Page.
 *  Column / Bar (grouped or stacked, one or more measures), Line, Area, Pie and Donut; other types are drawn as a column chart.
 *  Pure: `chartSvg(chart, rows)` where `chart` is the model's `{ type, title, dimensions, measures }` and `rows` the data. */

const W = 560
const H = 300
const PLOT = { left: 56, right: 16, top: 16, bottom: 56 }
const COLORS = 8

// UI5's ordered chart colors follow the theme (also dark); the fallbacks are Horizon's
const FALLBACK = ["#5899da","#e8743b","#19a979","#ed4a7b","#945ecf","#13a4b4","#525df4","#bf399e"]
const color = i => `var(--sapChart_OrderedColor_${(i % COLORS) + 1}, ${FALLBACK[i % COLORS]})`
const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const round = n => Math.round(n * 100) / 100

/** The ChartType enum member (`UI.ChartType/ColumnStacked`, `{ $EnumMember }` or the bare name) as its short name. */
const chartTypeName = type => String(type?.$EnumMember ?? type ?? 'Column').split('/').pop()

/** A tick step that gives about five round-numbered gridlines up to `max`. */
function niceScale(max) {
  if (!(max > 0)) return { top: 1, step: 0.2 }
  const raw = max / 5
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw)
  return { top: Math.ceil(max / step) * step, step }
}

const formatTick = n => Math.abs(n) >= 1e6 ? `${round(n / 1e6)}M` : Math.abs(n) >= 1e3 ? `${round(n / 1e3)}K` : String(round(n))

function legend(items) {
  return html`<ul class="hf-chart__legend">${items.map((item, i) => html`<li><span class="hf-chart__swatch" style="background:${raw(color(i))}"></span>${item}</li>`)}</ul>`
}

/** Pie and donut: the share of the first measure per dimension value. */
function pie(rows, { dimension, measure, donut, label }) {
  const values = rows.map(row => Math.max(0, num(row[measure.path])))
  const total = values.reduce((a, b) => a + b, 0)
  const cx = 150
  const cy = H / 2
  const r = 110
  const slices = []
  if (total > 0) {
    let angle = -Math.PI / 2
    values.forEach((value, i) => {
      if (!value) return
      const sweep = value / total * Math.PI * 2
      const end = angle + sweep
      const title = `${rows[i][dimension.path]}: ${value} (${round(value / total * 100)}%)`
      if (sweep >= Math.PI * 2 - 1e-9) slices.push(html`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${raw(color(i))}"><title>${title}</title></circle>`)
      else {
        const [x1, y1, x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle), cx + r * Math.cos(end), cy + r * Math.sin(end)].map(round)
        slices.push(html`<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${raw(color(i))}"><title>${title}</title></path>`)
      }
      angle = end
    })
  }
  const hole = donut ? html`<circle cx="${cx}" cy="${cy}" r="${r * 0.58}" class="hf-chart__hole"></circle>` : html``
  return { svg: html`<svg class="hf-chart__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${slices}${hole}</svg>`, legend: rows.map(row => row[dimension.path]) }
}

/** Column, bar, line and area charts over the dimension, one series per measure. */
function cartesian(rows, { dimension, measures, name, label }) {
  const horizontal = name.startsWith('Bar')
  const P = horizontal ? { ...PLOT, left: 112 } : PLOT // a bar chart's category labels run along the left
  const stacked = name.endsWith('Stacked')
  const lineLike = name === 'Line' || name === 'Area'
  const seriesValues = measures.map(m => rows.map(row => num(row[m.path])))
  const totals = rows.map((_, i) => stacked ? seriesValues.reduce((sum, s) => sum + Math.max(0, s[i]), 0) : Math.max(0, ...seriesValues.map(s => s[i])))
  const lows = Math.min(0, ...seriesValues.flat())
  const { top, step } = niceScale(Math.max(...totals, 0))
  const min = lows < 0 ? -niceScale(-lows).top : 0
  const span = top - min || 1
  const pw = W - P.left - P.right
  const ph = H - P.top - P.bottom
  // value axis runs along the height for column-like charts, along the width for bar charts
  const along = horizontal ? pw : ph
  const pos = v => round((v - min) / span * along)
  const band = (horizontal ? ph : pw) / Math.max(rows.length, 1)
  const parts = []

  for (let v = min; v <= top + step / 2; v += step) {
    const p = pos(v)
    if (horizontal) parts.push(html`<line class="hf-chart__grid" x1="${P.left + p}" x2="${P.left + p}" y1="${P.top}" y2="${P.top + ph}"></line><text class="hf-chart__tick" x="${P.left + p}" y="${P.top + ph + 16}" text-anchor="middle">${formatTick(v)}</text>`)
    else parts.push(html`<line class="hf-chart__grid" x1="${P.left}" x2="${P.left + pw}" y1="${P.top + ph - p}" y2="${P.top + ph - p}"></line><text class="hf-chart__tick" x="${P.left - 6}" y="${P.top + ph - p + 4}" text-anchor="end">${formatTick(v)}</text>`)
  }
  const every = Math.ceil(rows.length / (horizontal ? Math.max(ph / 14, 1) : Math.max(pw / 60, 1)))
  rows.forEach((row, i) => {
    if (i % every) return
    const text = String(row[dimension.path] ?? '')
    const shown = text.length > 12 ? `${text.slice(0, 11)}…` : text
    if (horizontal) parts.push(html`<text class="hf-chart__tick" x="${P.left - 6}" y="${P.top + band * i + band / 2 + 4}" text-anchor="end">${shown}</text>`)
    else parts.push(html`<text class="hf-chart__tick" x="${P.left + band * i + band / 2}" y="${P.top + ph + 16}" text-anchor="middle">${shown}</text>`)
  })

  const zero = pos(0)
  const title = (i, s) => `${rows[i][dimension.path]} - ${measures[s].label}: ${seriesValues[s][i]}`
  if (lineLike) {
    const at = (i, v) => horizontal ? null : [round(P.left + band * i + band / 2), round(P.top + ph - pos(v))]
    measures.forEach((m, s) => {
      const stack = rows.map((_, i) => stacked ? seriesValues.slice(0, s + 1).reduce((sum, ser) => sum + ser[i], 0) : seriesValues[s][i])
      const points = stack.map((v, i) => at(i, v))
      const line = points.map(([x, y]) => `${x},${y}`).join(' ')
      if (name === 'Area' && points.length) parts.push(html`<polygon points="${raw(`${points[0][0]},${P.top + ph - zero} ${line} ${points.at(-1)[0]},${P.top + ph - zero}`)}" fill="${raw(color(s))}" fill-opacity="0.25"></polygon>`)
      parts.push(html`<polyline points="${raw(line)}" fill="none" stroke="${raw(color(s))}" stroke-width="2"></polyline>`)
      points.forEach(([x, y], i) => parts.push(html`<circle cx="${x}" cy="${y}" r="3.5" fill="${raw(color(s))}"><title>${title(i, s)}</title></circle>`))
    })
  } else {
    const inner = stacked ? band * 0.6 : band * 0.7 / measures.length
    rows.forEach((_, i) => {
      let offset = 0
      measures.forEach((m, s) => {
        const v = seriesValues[s][i]
        const length = Math.abs(pos(v) - zero)
        const start = stacked ? offset : (v < 0 ? pos(v) : zero)
        const lead = stacked ? band * 0.2 : band * 0.15 + inner * s
        const [x, y, w, h] = horizontal
          ? [P.left + (stacked ? zero + offset : start), P.top + band * i + lead, length, inner]
          : [P.left + band * i + lead, P.top + ph - (stacked ? zero + offset + length : start + length), inner, length]
        if (stacked) offset += length
        parts.push(html`<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${raw(color(s))}"><title>${title(i, s)}</title></rect>`)
      })
    })
  }
  // axis lines
  parts.push(html`<line class="hf-chart__axis" x1="${P.left}" x2="${P.left}" y1="${P.top}" y2="${P.top + ph}"></line><line class="hf-chart__axis" x1="${P.left}" x2="${P.left + pw}" y1="${P.top + ph}" y2="${P.top + ph}"></line>`)
  return { svg: html`<svg class="hf-chart__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${parts}</svg>`, legend: measures.length > 1 ? measures.map(m => m.label) : [] }
}

/** The chart as markup: a figure with a caption, the SVG and (for several series, or a pie) a legend. `chart` is
 *  `{ type, title, description, dimensions: [{ path, label }], measures: [{ path, label }] }`. */
function chartSvg(chart, rows) {
  const dimension = chart.dimensions?.[0]
  const measures = chart.measures ?? []
  const caption = chart.title ? html`<figcaption class="hf-chart__title">${chart.title}</figcaption>` : html``
  if (!dimension || !measures.length || !rows.length) return html`<figure class="hf-chart hf-chart--empty">${caption}<p class="hf-chart__empty">${chart.emptyText ?? 'No data'}</p></figure>`
  const name = chartTypeName(chart.type)
  const label = [chart.title, chart.description].filter(Boolean).join('. ') || `${measures.map(m => m.label).join(', ')} by ${dimension.label}`
  const drawn = name === 'Pie' || name === 'Donut'
    ? pie(rows, { dimension, measure: measures[0], donut: name === 'Donut', label })
    : cartesian(rows, { dimension, measures, name, label })
  return html`<figure class="hf-chart hf-chart--${name.toLowerCase()}">${caption}${drawn.svg}${drawn.legend.length ? legend(drawn.legend) : html``}</figure>`
}

module.exports = { chartSvg, chartTypeName, niceScale }
