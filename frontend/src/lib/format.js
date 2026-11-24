const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const formatInr = (n) => `₹${inr.format(Math.round(n))}`

export function hoursToHM(hours) {
  const total = Math.round(hours * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}

export function formatDuration(hours) {
  const { h, m } = hoursToHM(hours)
  return m ? `${h}h ${m}m` : `${h}h`
}

export const hmToHours = (h, m) => Number(h || 0) + Number(m || 0) / 60

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix} (${hhmm})`
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
