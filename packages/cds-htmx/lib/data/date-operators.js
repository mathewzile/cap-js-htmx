/** The date operators of FE's date filter -- `Today`, `Yesterday`, `Tomorrow`, `This week/month/year`, `Last n days`
 *  and `Next n days` -- typed (or picked in "Define Conditions") as text into a date filter field. */

const DAY = 86400000
const isoDay = ms => new Date(ms).toISOString().slice(0, 10)

/** The inclusive `[from, to]` days (`YYYY-MM-DD`) an operator stands for, or `undefined` when the text is no
 *  operator. Relative to `now` (UTC day; weeks start on Monday), so it can be tested. */
function dateRange(text, now = Date.now()) {
  const token = String(text).trim().toLowerCase().replace(/\s+/g, ' ')
  const today = Math.floor(now / DAY) * DAY
  let m
  if (token === 'today') return [isoDay(today), isoDay(today)]
  if (token === 'yesterday') return [isoDay(today - DAY), isoDay(today - DAY)]
  if (token === 'tomorrow') return [isoDay(today + DAY), isoDay(today + DAY)]
  if (token === 'this week') {
    const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY
    return [isoDay(monday), isoDay(monday + 6 * DAY)]
  }
  if (token === 'this month') {
    const d = new Date(today)
    return [isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))]
  }
  if (token === 'this year') {
    const year = new Date(today).getUTCFullYear()
    return [year + '-01-01', year + '-12-31']
  }
  if ((m = /^last (\d+) days$/.exec(token))) return [isoDay(today - Number(m[1]) * DAY), isoDay(today)]
  if ((m = /^next (\d+) days$/.exec(token))) return [isoDay(today), isoDay(today + Number(m[1]) * DAY)]
  return undefined
}

module.exports = { dateRange }
