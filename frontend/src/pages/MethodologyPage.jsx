import { Link } from 'react-router-dom'
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

function Stat({ label, value, note }) {
  return (
    <div className="min-w-0 bg-night-900 p-5">
      <dt className="text-[13px] leading-5 text-mist">{label}</dt>
      <dd className="mt-2 font-display text-4xl leading-none text-ink tabular">{value}</dd>
      <dd className="mt-2 text-sm leading-relaxed text-fog">{note}</dd>
    </div>
  )
}

function coverage(options) {
  if (!options) return null
  const routes = new Set()
  for (const c of Object.values(options.airline_class_routes)) for (const v of Object.values(c)) v.routes.forEach((r) => routes.add(r))
  return { routes: routes.size, airlines: Object.keys(options.airline_class_routes).length, cities: options.cities.length }
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
    { title: 'Data', text: `Historical listed fares scraped from one Indian booking platform, for journeys from ${period}, all collected on a single booking date.` },
    { title: 'Cleaning', text: 'Exact duplicates removed, invalid records checked, First class excluded (too few observations). Raw files were never modified.' },
    { title: 'Features', text: 'Eight inputs a traveller can supply: route, airline, class, stops, duration, days ahead and departure time, plus a route-length reference. Flight numbers are never used.' },
    { title: 'Model', text: `A Random Forest (75%) blended with a route-level median lookup (25%), trained on log fare${tr ? ` using ${tr.rows.toLocaleString('en-IN')} rows` : ''}, tuned on flights held out from training.` },
    { title: 'Evaluation', text: 'Ten draws of flights the model never saw, plus a check on 2022 fares from the same platform. No test data was used for tuning.' },
  ]
  const grid = 'grid overflow-hidden rounded-2xl border border-ink/[0.08] [&>*]:border-ink/[0.08]'

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-24 sm:px-6 lg:px-10 lg:pt-32">
      <header className="max-w-3xl">
        <h1 className="font-display text-[clamp(2.5rem,5.4vw,4.5rem)] leading-[1.04] tracking-[-0.02em] text-ink">About the model</h1>
        <p className="mt-4 text-lg leading-relaxed text-mist">How AirfareIndex turns an itinerary into a fare estimate, how well that worked in testing, and where it should not be trusted.</p>
      </header>

      {insights.status === 'loading' && <Panel className="mt-12"><p className="flex items-center gap-3 text-mist" role="status"><Spinner className="h-5 w-5 text-cyan" /> Loading model details…</p></Panel>}
      {insights.status === 'error' && (
        <div className="mt-12"><Alert title="Couldn't load model details" action={<Button variant="secondary" onClick={insights.reload}>Try again</Button>}>{insights.error.message}</Alert></div>
      )}

      <section aria-labelledby="pipe-h" className="mt-16 lg:mt-20">
        <SectionHeading id="pipe-h" title="From listed fares to an estimate" />
        <ol className="mt-10 grid gap-8 md:grid-cols-2 xl:grid-cols-5 xl:gap-6">
          {pipeline.map((p, i) => (
            <li key={p.title} className="border-t border-ink/10 pt-5">
              <span className="font-mono text-xs text-fog">{i + 1}</span>
              <h3 className="mt-2 text-lg font-medium text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{p.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {ev && (
        <section id="evaluation" aria-labelledby="acc-h" className="mt-24">
          <SectionHeading id="acc-h" title="How well did it do in testing?">
            All figures come from held-out tests. They describe the model as a whole, not any single estimate.
          </SectionHeading>
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="panel p-8"><Instrument value={ev.unseen_flights.median_ape_pct} label="Typical error on unseen flights" sub="Median absolute percentage error" /></div>
            <dl className={`${grid} sm:grid-cols-2 [&>*:nth-child(n+2)]:border-t sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(even)]:border-l`}>
              <Stat label="Typical error, flights not seen in training" value={`${ev.unseen_flights.median_ape_pct}%`}
                note={`Median absolute percentage error, ±${ev.unseen_flights.median_ape_sd_pct} points across ${ev.unseen_flights.draws} draws. Average error ${formatInr(ev.unseen_flights.mae_inr)}.`} />
              <Stat label="Typical error, flights seen on other dates" value={`${ev.seen_flights.median_ape_pct}%`}
                note={`Average error ${formatInr(ev.seen_flights.mae_inr)}. The model is tuned for new itineraries, so it is less sharp on known ones.`} />
              <Stat label="Typical error on 2022 fares" value={`${ev.other_period_2022.median_ape_pct}%`}
                note={`Economy fares were over-predicted by about ${ev.other_period_2022.economy_median_pred_over_actual}×. Do not use for other periods.`} />
              <Stat label="Average error by class, new itineraries" value={formatInr(ev.unseen_flights.by_class_mae_inr.Business)}
                note={`Business. Economy ${formatInr(ev.unseen_flights.by_class_mae_inr.Economy)}, Premium Economy ${formatInr(ev.unseen_flights.by_class_mae_inr['Premium Economy'])}.`} />
            </dl>
          </div>
          <Panel className="mt-6 sm:p-8">
            <h3 className="text-lg font-medium text-ink">Compared with simpler approaches</h3>
            <p className="mt-1 text-sm text-mist">Average error on flights not seen in training (lower is better).</p>
            <div className="mt-6">
              <BarList rows={ev.comparison_unseen_mae_inr.map((m) => ({ key: m.model, label: NAMES[m.model] ?? m.model, value: m.mae_inr }))} format={formatInr} highlight="blend_rf_lookup" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-mist">A route-level lookup is nearly as accurate: the eight inputs describe a route’s price level much better than any single flight.</p>
          </Panel>
        </section>
      )}

      {insights.data && (
        <section id="explainability" aria-labelledby="fac-h" className="mt-24">
          <SectionHeading id="fac-h" title="What the model pays attention to">
            {insights.data.factor_note} These are associations learned from data, not causes of fares.
          </SectionHeading>
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Panel className="sm:p-8">
              <h3 className="text-lg font-medium text-ink">Share of the model’s attention (SHAP)</h3>
              <div className="mt-6"><BarList rows={insights.data.factors.map((f) => ({ key: f.key, label: f.label, value: f.share_pct }))} format={(v) => `${v}%`} highlight={insights.data.factors[0]?.key} /></div>
            </Panel>
            <ul className="space-y-6">
              {insights.data.directions.map((d) => (
                <li key={d.factor} className="border-t border-ink/10 pt-4">
                  <p className="font-medium text-ink">{d.factor}</p>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{d.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="cov-h" className="mt-24">
        <SectionHeading id="cov-h" title="What you can estimate" />
        <dl className={`${grid} mt-10 grid-cols-2 md:grid-cols-5 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*]:border-l md:[&>*]:border-t-0 md:[&>*:first-child]:border-l-0`}>
          <Stat label="Cities" value={cov?.cities ?? '—'} note="Major metros only" />
          <Stat label="Routes" value={cov?.routes ?? '—'} note="Every direction between them" />
          <Stat label="Airlines" value={cov?.airlines ?? '—'} note="Seen in the data" />
          <Stat label="Classes" value="3" note="Economy, Premium Economy, Business. No First." />
          <Stat label="Lead time" value={options.data ? `${options.data.days_left_range[0]}–${options.data.days_left_range[1]}` : '—'} note="Days before departure" />
        </dl>
      </section>

      <section aria-labelledby="why-h" className="mt-24 grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHeading id="why-h" title="Why estimates can differ from market prices" />
          <ul className="mt-8 space-y-3 text-mist">
            {[
              'The model learned listed fares, not prices people actually paid.',
              `All training fares were collected on one booking date for journeys from ${period}. Prices today may be at a different level.`,
              'Seat availability, fare buckets, demand and competitor moves are not visible to the model.',
              'Days before departure and the calendar date are tied together in the data, so their effects cannot be separated.',
              'Holidays and special events are not modelled. Departure time is accepted but not used by this model version.',
            ].map((t) => <li key={t} className="flex gap-3 leading-relaxed"><span aria-hidden="true" className="mt-3 h-1 w-1 shrink-0 rounded-full bg-fog" />{t}</li>)}
          </ul>
        </div>
        <Panel className="self-start sm:p-8">
          <h2 id="lim-h" className="text-lg font-medium text-ink">Limits</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-mist">
            <li>Trained on historical <span className="font-medium text-ink">listed</span> fares from one platform for journeys in January to March 2023. It does not predict live or real-time fares and does not guarantee accuracy.</li>
            <li>Lead time is limited to 1 to 50 days; supported airlines, routes and classes are those seen in training. First class is not supported.</li>
            <li>Unseen airlines, routes and future market periods have not been independently validated.</li>
            <li>Departure time is accepted but is not used by this model version.</li>
          </ul>
          <Link to="/predict" className={buttonClass('primary', 'mt-6')}>Try the estimator</Link>
        </Panel>
      </section>
    </div>
  )
}
