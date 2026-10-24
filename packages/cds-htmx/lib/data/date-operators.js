/** The date operators of FE's date filter -- `Today`, `Yesterday`, `Tomorrow`, this / last / next week, month, quarter and year,
 *  the quarters of the year, `Year to Date`, `Date to Year`, `Last n days / weeks / months / quarters / years` (and Next),
 *  `Today -x / +y days`, `Month yyyy-mm` -- typed (or picked in the date filter's list or "Define Conditions") as text into a date filter field. */

const DAY = 86400000
const isoDay = ms => new Date(ms).toISOString().slice(0, 10)
const utc = (year, month, day = 1) => Date.UTC(year, month, day)

/** The first and last day (ms) of the week (Monday first), month, quarter or year that is `offset` units from the one `today` is in. */
function unitRange(unit, today, offset = 0) {
  const d = new Date(today)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  if (unit === 'week') {
    const monday = today - ((d.getUTCDay() + 6) % 7) * DAY + offset * 7 * DAY
    return [monday, monday + 6 * DAY]
  }
  if (unit === 'month') return [utc(year, month + offset), utc(year, month + offset + 1) - DAY]
  if (unit === 'quarter') {
    const first = Math.floor(month / 3) * 3 + offset * 3
    return [utc(year, first), utc(year, first + 3) - DAY]
  }
  if (unit === 'year') return [utc(year + offset, 0), utc(year + offset + 1, 0) - DAY]
  return [today + offset * DAY, today + offset * DAY]
}

const ORDINALS = ['first', 'second', 'third', 'fourth']

/** The inclusive `[from, to]` days (`YYYY-MM-DD`) an operator stands for, or `undefined` when the text is no
 *  operator. Relative to `now` (UTC day; weeks start on Monday), so it can be tested. */
function dateRange(text, now = Date.now()) {
  const token = String(text).trim().toLowerCase().replace(/\s+/g, ' ')
  const today = Math.floor(now / DAY) * DAY
  const year = new Date(today).getUTCFullYear()
  const iso = ([from, to]) => [isoDay(from), isoDay(to)]
  let m
  if (token === 'today') return iso([today, today])
  if (token === 'yesterday') return iso([today - DAY, today - DAY])
  if (token === 'tomorrow') return iso([today + DAY, today + DAY])
  if ((m = /^(this|last|next) (week|month|quarter|year)$/.exec(token))) return iso(unitRange(m[2], today, { this: 0, last: -1, next: 1 }[m[1]]))
  if ((m = /^(first|second|third|fourth) quarter$/.exec(token))) return iso([utc(year, ORDINALS.indexOf(m[1]) * 3), utc(year, ORDINALS.indexOf(m[1]) * 3 + 3) - DAY])
  if (token === 'year to date') return iso([utc(year, 0), today])
  if (token === 'date to year') return iso([today, utc(year + 1, 0) - DAY])
  if ((m = /^month (\d{4})-(\d\d)$/.exec(token))) return iso([utc(Number(m[1]), Number(m[2]) - 1), utc(Number(m[1]), Number(m[2])) - DAY])
  if ((m = /^today -(\d+)\/\+(\d+) days$/.exec(token))) return iso([today - Number(m[1]) * DAY, today + Number(m[2]) * DAY])
  if ((m = /^last (\d+) days$/.exec(token))) return iso([today - Number(m[1]) * DAY, today])
  if ((m = /^next (\d+) days$/.exec(token))) return iso([today, today + Number(m[1]) * DAY])
  if ((m = /^(last|next) (\d+) (week|month|quarter|year)s$/.exec(token))) {
    const n = Number(m[2])
    return m[1] === 'last'
      ? iso([unitRange(m[3], today, -n)[0], unitRange(m[3], today, -1)[1]])
      : iso([unitRange(m[3], today, 1)[0], unitRange(m[3], today, n)[1]])
  }
  return undefined
}

/** `Not Specified`: the date is empty. */
const isNotSpecified = text => String(text).trim().toLowerCase() === 'not specified'

module.exports = { dateRange, isNotSpecified }
