// Travel date <-> days ahead. The model takes days_left (whole days from today); the date is only a friendlier way to enter it.
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const midnight = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function dateFromToday(days, now = new Date()) {
  const d = midnight(now)
  d.setDate(d.getDate() + Number(days))
  return iso(d)
}

// Whole calendar days from today to an ISO date (local time), or NaN for an invalid date.
export function daysFromToday(isoDate, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '')
  if (!m) return NaN
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.round((target - midnight(now)) / 86400000)
}

export function formatDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '')
  if (!m) return ''
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
