const cds = require('@sap/cds')

/** A query returns at most `cds.query.limit.max` rows (1000 by default), so a long table is read page by page; each page
 *  asks for one row more than it keeps (the has-more probe), which must still fit under that maximum. */
const pageSize = () => Math.max((cds.env.query?.limit?.max ?? 1000) - 1, 1)

/** Reads a table to its end, at most `limit` rows. `fetchPage(skip, size)` answers `{ rows, hasMore }` with at most `size` rows. */
async function readAll(fetchPage, limit) {
  const size = pageSize()
  const rows = []
  for (let skip = 0; rows.length < limit; skip += size) {
    const page = await fetchPage(skip, size)
    rows.push(...page.rows)
    if (!page.hasMore) break
  }
  rows.length = Math.min(rows.length, limit)
  return rows
}

function cell(value) {
  let text = String(value ?? '')
  // Spreadsheet formula injection: a cell starting with = + - @ would be run by Excel
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A CSV document (with the byte order mark Excel wants) from a header line and rows of values. */
function toCsv(header, rows) {
  const lines = [header, ...rows].map(values => values.map(cell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** The response headers of a download: the file is named by the entity set (ASCII) and, for the browser's save dialog, by the display name. */
function csvHeaders(fileStem, displayName) {
  const name = String(displayName).replace(/[^\w .-]/g, '_')
  return { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileStem}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv` }
}

module.exports = { readAll, toCsv, csvHeaders }
