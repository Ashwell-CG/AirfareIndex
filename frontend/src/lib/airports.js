// IATA airport codes, used only as display labels for the seven supported cities.
export const IATA = { Ahmedabad: 'AMD', Bangalore: 'BLR', Chennai: 'MAA', Delhi: 'DEL', Hyderabad: 'HYD', Kolkata: 'CCU', Mumbai: 'BOM' }
export const iata = (city) => IATA[city] ?? city.slice(0, 3).toUpperCase()

// Approximate city-centre coordinates (degrees), used only to place cities on the route map and in the 3D scene.
export const COORDS = {
  Delhi: [28.61, 77.21], Mumbai: [19.08, 72.88], Bangalore: [12.97, 77.59], Chennai: [13.08, 80.27],
  Hyderabad: [17.39, 78.49], Kolkata: [22.57, 88.36], Ahmedabad: [23.02, 72.57],
}

// Equirectangular projection into a unit box (x: west to east, y: north to south), with a small margin.
const LAT = [11.5, 30], LON = [71, 90]
export function project(city) {
  const c = COORDS[city]
  if (!c) return null
  return [(c[1] - LON[0]) / (LON[1] - LON[0]), (LAT[1] - c[0]) / (LAT[1] - LAT[0])]
}

// Unique undirected city pairs from the supported options (routes are listed per direction there).
export function routePairs(options) {
  const seen = new Map()
  if (!options) return []
  for (const classes of Object.values(options.airline_class_routes)) {
    for (const v of Object.values(classes)) {
      for (const r of v.routes) {
        const [a, b] = r.split('-')
        const key = [a, b].sort().join('|')
        seen.set(key, [a, b].sort())
      }
    }
  }
  return [...seen.values()]
}
