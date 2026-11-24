import { formatDuration, hmToHours } from './format'
import { classesFor, durationRange, routeKey } from './options'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Mirrors the backend rules (schemas + ml.inference.validate) so users see problems before a request is sent.
// The backend remains the authority and re-validates everything.
export function validateForm(v, options) {
  const e = {}
  if (!v.source) e.source = 'Choose an origin city.'
  if (!v.destination) e.destination = 'Choose a destination city.'
  if (v.source && v.destination && v.source === v.destination) e.destination = 'Origin and destination must be different.'
  if (!v.airline) e.airline = 'Choose an airline.'
  if (!v.travel_class) e.travel_class = 'Choose a travel class.'
  if (v.airline && v.travel_class && v.source && v.destination && !e.destination) {
    if (!classesFor(options, v.airline, v.source, v.destination).includes(v.travel_class)) {
      e.travel_class = `${v.airline} does not offer ${v.travel_class} on ${routeKey(v.source, v.destination)} in the model's data.`
    }
  }
  if (!TIME.test(v.departure_time || '')) e.departure_time = 'Enter a departure time.'
  if (!v.stops) e.stops = 'Choose the number of stops.'

  const days = Number(v.days_left)
  const [dMin, dMax] = options.days_left_range
  if (v.days_left === '' || !Number.isInteger(days) || days < dMin || days > dMax) {
    e.days_left = `Enter a whole number of days from ${dMin} to ${dMax}.`
  }

  const hRaw = v.durH === '' || v.durH == null ? NaN : Number(v.durH)
  const mRaw = v.durM === '' || v.durM == null ? 0 : Number(v.durM)
  if (!Number.isInteger(hRaw) || hRaw < 0 || !Number.isInteger(mRaw) || mRaw < 0 || mRaw > 59) {
    e.duration = 'Enter the duration as whole hours and minutes (minutes 0 to 59).'
  } else {
    const hours = hmToHours(hRaw, mRaw)
    const range = v.stops ? durationRange(options, v.stops) : null
    if (hours <= 0) e.duration = 'Duration must be greater than zero.'
    else if (range && (hours < range[0] - 1e-6 || hours > range[1] + 1e-6)) {
      e.duration = `For ${v.stops} itineraries the model supports ${formatDuration(range[0])} to ${formatDuration(range[1])}.`
    }
  }
  if (Object.keys(e).length) return { errors: e, payload: null }
  return {
    errors: e,
    payload: {
      source: v.source, destination: v.destination, airline: v.airline, travel_class: v.travel_class,
      departure_time: v.departure_time, stops: v.stops, duration_hours: Math.round(hmToHours(hRaw, mRaw) * 10000) / 10000, days_left: days,
    },
  }
}
