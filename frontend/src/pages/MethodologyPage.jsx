import { Link } from 'react-router-dom'
import { m, useReducedMotion } from 'framer-motion'
import { Plane } from 'lucide-react'
import Instrument from '../components/Instrument'
import { SectionHeading } from '../components/motion/Reveal'
import { Alert, BarList, Button, Panel, Spinner } from '../components/ui/ui'
import { buttonClass } from '../components/ui/styles'
import { useResource } from '../hooks/useResource'
import { formatInr } from '../lib/format'
import { getInsights, getModelInfo, getOptions } from '../services/api'

const loadInsights = () => getInsights()
const loadInfo = () => getModelInfo()
const loadOptions = () => getOptions()

const NAMES = { blend_rf_lookup: 'Random Forest + route lookup (used here)', rf_tuned: 'Random Forest alone', route_lookup: 'Route-level median lookup', xgb_tuned: 'XGBoost', ridge: 'Ridge regression' }
const niceDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const container = 'mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10'

function coverage(options) {
  if (!options) return null
  const routes = new Set()
  for (const c of Object.values(options.airline_class_routes)) for (const v of Object.values(c)) v.routes.forEach((r) => routes.add(r))
  return { routes: routes.size, airlines: Object.keys(options.airline_class_routes).length, cities: options.cities.length }
}

function Figure({ label, value, note }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-mist">{label}</dt>
      <dd className="display-lg mt-1 text-[clamp(2.25rem,4vw,3.25rem)] text-ink tabular">{value}</dd>
      {note && <dd className="mt-1 text-sm leading-relaxed text-fog">{note}</dd>}
    </div>
  )
}

// Model comparison: lower bar is better; the model in use is highlighted.
function Comparison({ rows }) {
  const reduce = useReducedMotion()
  const max = Math.max(...rows.map((r) => r.mae_inr))
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Average and median error of each candidate model on flights not seen in training</caption>
      <thead>
        <tr className="border-b border-white/[0.08] text-[0.8125rem] text-mist">
          <th scope="col" className="py-3 pr-4 font-medium">Model</th>
          <th scope="col" className="hidden w-[40%] py-3 pr-4 font-medium sm:table-cell"><span className="sr-only">Average error bar</span></th>
          <th scope="col" className="py-3 pr-4 text-right font-medium">Average error</th>
          <th scope="col" className="py-3 text-right font-medium">Median error</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const on = r.model === 'blend_rf_lookup'
          return (
            <tr key={r.model} className="border-b border-white/[0.05] last:border-0">
              <th scope="row" className={`py-3.5 pr-4 font-medium ${on ? 'text-ink' : 'text-mist'}`}>{NAMES[r.model] ?? r.model}</th>
              <td className="hidden py-3.5 pr-4 sm:table-cell">
                <span className="relative block h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                  <m.span className={`absolute inset-y-0 left-0 rounded-full ${on ? 'bg-cyan' : 'bg-white/30'}`} initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${(r.mae_inr / max) * 100}%` }} animate={reduce ? { width: `${(r.mae_inr / max) * 100}%` } : undefined}
                    viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] }} />
                </span>
              </td>
              <td className={`py-3.5 pr-4 text-right tabular ${on ? 'font-semibold text-cyan' : 'text-mist'}`}>{formatInr(r.mae_inr)}</td>
              <td className={`py-3.5 text-right tabular ${on ? 'font-semibold text-cyan' : 'text-mist'}`}>{r.median_ape_pct}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function MethodologyPage() {
  const insights = useResource('insights', loadInsights)
  const info = useResource('info', loadInfo)
  const options = useResource('options', loadOptions)
  const ev = insights.data?.evaluation
  const tr = info.data?.training
  const cov = coverage(options.data)
  const period = tr ? `${niceDate(tr.journey_dates[0])} to ${niceDate(tr.journey_dates[1])}` : 'January to March 2023'

  const pipeline = [
    { title: 'Data', text: `Historical listed fares from one Indian booking platform, for journeys from ${period}, all collected on a single booking date.` },
    { title: 'Cleaning', text: 'Exact duplicates removed, invalid records checked, First class excluded (too few observations). Raw files were never modified.' },
    { title: 'Features', text: 'Inputs a traveller can supply: route, airline, class, stops, duration, days ahead and departure time, plus a route-length reference. Flight numbers are never used.' },
    { title: 'Model', text: `A Random Forest (75%) blended with a route-level median lookup (25%), trained on log fare${tr ? ` using ${tr.rows.toLocaleString('en-IN')} rows` : ''}.` },
    { title: 'Evaluation', text: 'Ten draws of flights the model never saw, plus a check on 2022 fares from the same platform. No test data was used for tuning.' },
  ]

  return (
    <div className="relative isolate">
      <div className="sky pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] opacity-70 [mask-image:linear-gradient(180deg,black_35%,transparent)]" aria-hidden="true" />
      <div className="starfield pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-60" aria-hidden="true" />
      <div className={`pb-28 pt-24 lg:pt-32 ${container}`}>
        <header className="max-w-4xl">
          <h1 className="display-xl text-[clamp(3.25rem,7vw,6rem)] text-ink">About the model</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mist">How AirfareIndex turns an itinerary into a fare estimate, how well that worked in testing, and where it should not be trusted.</p>
        </header>

        {insights.status === 'loading' && <Panel className="mt-12"><p className="flex items-center gap-3 text-mist" role="status"><Spinner className="h-5 w-5 text-cyan" /> Loading model details…</p></Panel>}
        {insights.status === 'error' && (
          <div className="mt-12"><Alert title="Couldn't load model details" action={<Button variant="secondary" onClick={insights.reload}>Try again</Button>}>{insights.error.message}</Alert></div>
        )}

        {ev && (
          <dl className="mt-14 grid grid-cols-2 gap-x-8 gap-y-8 border-y border-white/[0.08] py-8 lg:grid-cols-4">
            <Figure label="Training rows" value={tr ? tr.rows.toLocaleString('en-IN') : '—'} note="Train and validation fares" />
            <Figure label="Journey dates covered" value={tr ? `${Math.round((new Date(tr.journey_dates[1]) - new Date(tr.journey_dates[0])) / 864e5) + 1} days` : '—'} note={period} />
            <Figure label="Typical error, unseen flights" value={`${ev.unseen_flights.median_ape_pct}%`} note={`Median, ±${ev.unseen_flights.median_ape_sd_pct} over ${ev.unseen_flights.draws} draws`} />
            <Figure label="R², unseen flights" value={ev.unseen_flights.r2} note="Share of fare variation explained" />
          </dl>
        )}

        <section aria-labelledby="pipe-h" className="mt-24">
          <SectionHeading id="pipe-h" title="From listed fares to an estimate." />
          <ol className="mt-12 grid gap-10 md:grid-cols-2 xl:grid-cols-5 xl:gap-8">
            {pipeline.map((p, i) => (
              <li key={p.title} className="relative min-w-0 border-t border-white/12 pt-6">
                <span aria-hidden="true" className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-cyan" />
                <p className="display-md text-sm text-cyan">Step {i + 1}</p>
                <h3 className="mt-2 text-xl font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">{p.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {ev && (
          <section id="evaluation" aria-labelledby="acc-h" className="mt-28">
            <SectionHeading id="acc-h" title="How well did it do in testing?">
              All figures come from held-out tests. They describe the model as a whole, not any single estimate.
            </SectionHeading>
            <div className="mt-12 grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="glass rounded-[2rem] p-8"><Instrument value={ev.unseen_flights.median_ape_pct} label="Typical error on unseen flights" sub="Median absolute percentage error" /></div>
              <div className="grid min-w-0 gap-6 md:grid-cols-2">
                <Panel aria-labelledby="by-test-h">
                  <h3 id="by-test-h" className="text-lg font-semibold text-ink">Typical error by test</h3>
                  <p className="mt-1 text-sm text-mist">Median absolute percentage error. Lower is better.</p>
                  <div className="mt-6">
                    <BarList labelWidth="sm:grid-cols-[9rem_minmax(0,1fr)_auto]" format={(v) => `${v}%`} highlight="unseen" rows={[
                      { key: 'seen', label: 'Flights seen on other dates', value: ev.seen_flights.median_ape_pct },
                      { key: 'unseen', label: 'Flights not seen in training', value: ev.unseen_flights.median_ape_pct },
                      { key: '2022', label: '2022 fares, same platform', value: ev.other_period_2022.median_ape_pct },
                    ]} />
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-mist">On 2022 fares, Economy was over-predicted by about {ev.other_period_2022.economy_median_pred_over_actual}×. The model should not be used for other periods.</p>
                </Panel>
                <Panel aria-labelledby="by-class-h">
                  <h3 id="by-class-h" className="text-lg font-semibold text-ink">Average error by cabin</h3>
                  <p className="mt-1 text-sm text-mist">Flights not seen in training, in rupees.</p>
                  <div className="mt-6">
                    <BarList labelWidth="sm:grid-cols-[9rem_minmax(0,1fr)_auto]" format={formatInr} rows={Object.entries(ev.unseen_flights.by_class_mae_inr).map(([k, v]) => ({ key: k, label: k, value: v }))} />
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-mist">Average error overall: {formatInr(ev.unseen_flights.mae_inr)}. Business fares are larger, so their errors are larger in rupees.</p>
                </Panel>
              </div>
            </div>
            <Panel className="mt-6" aria-labelledby="cmp-h">
              <h3 id="cmp-h" className="text-lg font-semibold text-ink">Compared with simpler approaches</h3>
              <p className="mt-1 text-sm text-mist">Error on flights not seen in training. Lower is better.</p>
              <div className="mt-4 overflow-x-auto"><Comparison rows={ev.comparison_unseen_mae_inr} /></div>
              <p className="mt-5 text-sm leading-relaxed text-mist">A route-level lookup is nearly as accurate: the inputs describe a route’s price level much better than any single flight.</p>
            </Panel>
          </section>
        )}

        {insights.data && (
          <section id="explainability" aria-labelledby="fac-h" className="mt-28">
            <SectionHeading id="fac-h" title="What the model pays attention to.">
              {insights.data.factor_note} These are associations learned from data, not causes of fares.
            </SectionHeading>
            <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Panel aria-labelledby="shap-h">
                <h3 id="shap-h" className="text-lg font-semibold text-ink">Share of the model’s attention (SHAP)</h3>
                <div className="mt-6"><BarList rows={insights.data.factors.map((f) => ({ key: f.key, label: f.label, value: f.share_pct }))} format={(v) => `${v}%`} highlight={insights.data.factors[0]?.key} /></div>
              </Panel>
              <ul className="min-w-0 space-y-6">
                {insights.data.directions.map((d) => (
                  <li key={d.factor} className="border-t border-white/[0.08] pt-5">
                    <p className="font-semibold text-ink">{d.factor}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-mist">{d.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section aria-labelledby="cov-h" className="mt-28">
          <SectionHeading id="cov-h" title="What you can estimate." />
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 border-y border-white/[0.08] py-8 md:grid-cols-5">
            <Figure label="Cities" value={cov?.cities ?? '—'} note="Major metros only" />
            <Figure label="Routes" value={cov?.routes ?? '—'} note="Every direction between them" />
            <Figure label="Airlines" value={cov?.airlines ?? '—'} note="Seen in the data" />
            <Figure label="Classes" value="3" note="Economy, Premium Economy, Business. No First." />
            <Figure label="Lead time" value={options.data ? `${options.data.days_left_range[0]}–${options.data.days_left_range[1]}` : '—'} note="Days before departure" />
          </dl>
        </section>

        <section aria-labelledby="why-h" className="mt-28 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading id="why-h" title="Why estimates can differ from market prices." />
            <ul className="mt-8 space-y-4 text-mist">
              {[
                'The model learned listed fares, not prices people actually paid.',
                `All training fares were collected on one booking date for journeys from ${period}. Prices today may be at a different level.`,
                'Seat availability, fare buckets, demand and competitor moves are not visible to the model.',
                'Days before departure and the calendar date are tied together in the data, so their effects cannot be separated.',
                'Holidays and special events are not modelled. Departure time is accepted but not used by this model version.',
              ].map((t) => <li key={t} className="flex gap-3 leading-relaxed"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />{t}</li>)}
            </ul>
          </div>
          <Panel aria-labelledby="lim-h" className="self-start border-horizon/25">
            <h2 id="lim-h" className="display-md text-[1.875rem] text-ink">Limits</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mist">
              <li>Trained on historical <strong className="text-ink">listed</strong> fares from one platform for journeys in January to March 2023. It does not predict live or real-time fares and does not guarantee accuracy.</li>
              <li>Lead time is limited to 1 to 50 days; supported airlines, routes and classes are those seen in training. First class is not supported.</li>
              <li>Unseen airlines, routes and future market periods have not been independently validated.</li>
              <li>Departure time is accepted but is not used by this model version.</li>
            </ul>
            {info.data?.limitations?.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-ink">From the model record</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fog">{info.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </>
            )}
            <Link to="/predict" className={buttonClass('primary', 'mt-7')}><Plane aria-hidden="true" className="h-4 w-4" />Try the estimator</Link>
          </Panel>
        </section>
      </div>
    </div>
  )
}
