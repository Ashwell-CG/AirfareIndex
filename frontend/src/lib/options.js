// Helpers over the /options payload (the model's real supported combinations). Nothing here invents options.
export const CLASS_ORDER = ['Economy', 'Premium Economy', 'Business']
export const STOPS_LABEL = { 'non-stop': 'Non-stop', '1-stop': '1 stop', '2+-stop': '2+ stops' }
export const routeKey = (source, destination) => `${source}-${destination}`

function eachRoute(options, fn) {
  for (const [airline, classes] of Object.entries(options.airline_class_routes)) {
    for (const [cls, v] of Object.entries(classes)) {
      for (const route of v.routes) fn(airline, cls, route)
    }
  }
}

export function sourceCities(options) {
  const s = new Set()
  eachRoute(options, (_a, _c, r) => s.add(r.split('-')[0]))
  return [...s].sort()
}

export function destinationsFor(options, source) {
  const s = new Set()
  if (!source) return []
  eachRoute(options, (_a, _c, r) => {
    const [from, to] = r.split('-')
    if (from === source) s.add(to)
  })
  return [...s].sort()
}

export function airlinesFor(options, source, destination) {
  if (!source || !destination) return []
  const key = routeKey(source, destination)
  const s = new Set()
  eachRoute(options, (a, _c, r) => r === key && s.add(a))
  return [...s].sort()
}

export function classesFor(options, airline, source, destination) {
  if (!airline || !source || !destination) return []
  const key = routeKey(source, destination)
  const classes = options.airline_class_routes[airline] || {}
  return CLASS_ORDER.filter((c) => classes[c]?.routes.includes(key))
}

export const durationHint = (options, source, destination, stops) =>
  options.duration_hints?.[routeKey(source, destination)]?.[stops] ?? null

export const durationRange = (options, stops) => options.duration_hours_range_by_stops[stops] ?? null
