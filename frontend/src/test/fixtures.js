// Test fixtures. The options come from the REAL backend files, so the tests exercise the model's actual supported combinations.
// The /predict response below is a TEST DOUBLE used only by unit tests; the application itself never contains canned predictions.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const backend = resolve(__dirname, '../../../backend')
const supported = JSON.parse(readFileSync(resolve(backend, 'data/processed/supported_options.json'), 'utf-8'))
const hints = JSON.parse(readFileSync(resolve(backend, 'app/resources/duration_hints.json'), 'utf-8'))

export const OPTIONS = {
  cities: supported.cities, stops: supported.stops, days_left_range: supported.days_left_range,
  duration_hours_range_by_stops: supported.duration_hours_range_by_stops, airline_class_routes: supported.airline_class_routes,
  duration_hints: hints, excluded_classes: supported.excluded_classes,
}

export const RESULT = {
  predicted_fare_inr: 7220, currency: 'INR',
  itinerary: { source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy', departure_time: '09:00', stops: 'non-stop', duration_hours: 2.1667, days_left: 14 },
  departure_time_used_by_model: false,
  lead_time_profile: [1, 3, 7, 14, 21, 30, 40, 50].map((d, i) => ({ days_left: d, predicted_fare_inr: 7800 - i * 200 })),
  drivers: ['Travel class', 'Airline', 'Flight duration', 'Days before departure', 'Number of stops'].map((f) => ({ factor: f, value: 'x', text: `${f} text` })),
  typical_error: { metric: 'median absolute percentage error', value_pct: 11.4, sd_across_draws_pct: 0.7, draws: 10, basis: '10 evaluation draws', is_per_prediction_confidence: false, note: 'n' },
  model: { name: 'm', description: 'Random Forest blend', trained_on: 'historical listed fares', training_period: 'journeys 2023-01-16 to 2023-03-06', evaluated_on: 'held-out flights' },
  limitations: ['Estimates are not live or real-time fares.', 'Supported lead time is 1 to 50 days before departure.'],
}

export const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

// fetch stub: routes by path; `overrides` lets a test change one endpoint.
export function stubFetch(overrides = {}) {
  const calls = []
  const fn = vi.fn(async (url, init = {}) => {
    const path = String(url).replace('/api', '')
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
    const o = overrides[path]
    if (o) return typeof o === 'function' ? o(init) : o
    if (path === '/options') return json(OPTIONS)
    if (path === '/predict') return json(RESULT)
    if (path === '/model/insights') return json({ factors: [{ key: 'travel_class', label: 'Travel class', share_pct: 54.3 }], factor_note: 'note', directions: [{ factor: 'Travel class', text: 't' }], evaluation: { unseen_flights: { draws: 10, mae_inr: 3154, mae_sd_inr: 185, median_ape_pct: 11.4, median_ape_sd_pct: 0.7, r2: 0.918, by_class_mae_inr: { Economy: 1563, 'Premium Economy': 2161, Business: 6759 } }, seen_flights: { mae_inr: 2849, median_ape_pct: 9.9, r2: 0.933 }, other_period_2022: { median_ape_pct: 35.3, economy_median_pred_over_actual: 1.65 }, comparison_unseen_mae_inr: [{ model: 'blend_rf_lookup', mae_inr: 3154, median_ape_pct: 11.4 }] } })
    return json({ error: 'http_error', message: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}
