import { airlinesFor, classesFor, destinationsFor } from './options'

export const INITIAL_VALUES = {
  source: '', destination: '', airline: '', travel_class: '', stops: 'non-stop', durH: '', durM: '', departure_time: '09:00', days_left: '14',
}

// Keeps dependent selections valid: destination depends on origin, airline on the route, class on airline + route.
export function cascade(values, options) {
  const next = { ...values }
  if (!destinationsFor(options, next.source).includes(next.destination)) next.destination = ''
  if (!airlinesFor(options, next.source, next.destination).includes(next.airline)) next.airline = ''
  const classes = classesFor(options, next.airline, next.source, next.destination)
  if (!classes.includes(next.travel_class)) next.travel_class = classes.length === 1 ? classes[0] : ''
  return next
}
