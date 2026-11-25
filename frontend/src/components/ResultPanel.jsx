import { useEffect, useRef } from 'react'
import { Clock3, Info, TriangleAlert } from 'lucide-react'
import Instrument from './Instrument'
import { CountUp, Enter, RouteArc, ShareMeter } from './results/pieces'
import { BarList, Panel } from './ui/ui'
import { iata } from '../lib/airports'
import { formatDuration, formatInr, formatTime, plural } from '../lib/format'
import { STOPS_LABEL } from '../lib/options'

const icon = 'h-4 w-4 shrink-0'

function Stub({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-5 text-fog">{label}</dt>
      <dd className="mt-1 break-words text-[15px] font-medium text-ink">{children}</dd>
    </div>
  )
}

function BoardingPass({ result, stale, headingRef }) {
  const it = result.itinerary
  return (
    <Enter>
      <section aria-labelledby="result-h" className="panel overflow-hidden">
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="result-h" ref={headingRef} tabIndex={-1} className="text-sm font-medium text-mist focus:outline-none">Model estimate</h2>
            <p className="flex flex-wrap gap-2">
              <span className="rounded-md border border-ink/10 bg-night-850 px-2 py-1 text-xs font-medium text-ink">{it.airline}</span>
              <span className="rounded-md border border-ink/10 bg-night-850 px-2 py-1 text-xs font-medium text-ink">{it.travel_class}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
            <div className="text-left">
              <p className="font-mono text-[clamp(1.75rem,6vw,2.75rem)] font-medium leading-none text-ink">{iata(it.source)}</p>
              <p className="mt-2 text-sm text-mist">{it.source}</p>
            </div>
            <RouteArc runKey={`${it.source}-${it.destination}-${result.predicted_fare_inr}`} className="h-auto w-full" />
            <div className="text-right">
              <p className="font-mono text-[clamp(1.75rem,6vw,2.75rem)] font-medium leading-none text-ink">{iata(it.destination)}</p>
              <p className="mt-2 text-sm text-mist">{it.destination}</p>
            </div>
          </div>
          <p className="sr-only">Route: {it.source} to {it.destination}</p>

          <div className="mt-8">
            <p className="font-display text-[clamp(3.25rem,10vw,5.5rem)] leading-[0.92] tracking-[-0.03em] text-ink">
              <CountUp value={result.predicted_fare_inr} testId="predicted-fare" />
            </p>
            <p className="mt-3 text-sm text-mist">Estimated one-way fare in {result.currency}, based on historical listed fares, not a live price</p>
          </div>
          {stale && <p role="status" className="mt-4 rounded-[10px] border border-horizon/30 bg-night-850 px-4 py-3 text-sm text-ink">You changed the form. Select “Estimate fare” to update this estimate.</p>}
        </div>

        {/* perforation */}
        <div className="relative h-0" aria-hidden="true">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-night-950" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-night-950" />
          <span className="absolute inset-x-6 top-0 border-t border-dashed border-ink/15" />
        </div>

        <div className="p-5 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stub label="Departure">{formatTime(it.departure_time).split(' (')[0]}</Stub>
            <Stub label="Stops">{STOPS_LABEL[it.stops] ?? it.stops}</Stub>
            <Stub label="Duration">{formatDuration(it.duration_hours)}</Stub>
            <Stub label="Booked ahead">{plural(it.days_left, 'day')}</Stub>
          </dl>
          {!result.departure_time_used_by_model && (
            <p className="mt-6 flex gap-2 text-[13px] leading-5 text-fog"><Info aria-hidden="true" strokeWidth={1.5} className={`mt-0.5 ${icon}`} />This model version does not use departure time: a different time gives the same estimate.</p>
          )}
        </div>
      </section>
    </Enter>
  )
}

export default function ResultPanel({ result, stale, insights }) {
  const heading = useRef(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    if (window.matchMedia?.('(max-width: 1023px)').matches) heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  const it = result.itinerary
  const te = result.typical_error
  const profile = result.lead_time_profile
  const profileRows = profile.map((p) => ({ key: p.days_left, label: plural(p.days_left, 'day'), value: p.predicted_fare_inr }))
  const first = profile[0], last = profile[profile.length - 1]
  const delta = last.predicted_fare_inr - first.predicted_fare_inr
  const shares = Object.fromEntries((insights?.factors ?? []).map((f) => [f.label, f.share_pct]))

  return (
    <div className="space-y-6" aria-live="polite">
      <BoardingPass result={result} stale={stale} headingRef={heading} />

      <Panel aria-labelledby="error-h" className="grid items-center gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <Instrument value={te.value_pct} label="Typical error" sub="Unseen flights, median" />
        <div>
          <h2 id="error-h" className="text-lg font-medium text-ink">How accurate are estimates like this?</h2>
          <p className="mt-2 leading-relaxed text-mist">
            On flights the model had not seen in training, its typical error was about <span className="font-medium text-ink">{te.value_pct}%</span> (median absolute percentage error, ±{te.sd_across_draws_pct} points across {te.draws} evaluation draws).
          </p>
          <p className="mt-4 rounded-[10px] border border-ink/[0.08] bg-night-850 p-4 text-sm leading-relaxed text-mist">
            <span className="font-medium text-ink">This is a model-level statistic, not a confidence score for this prediction.</span> This particular estimate could be closer to, or further from, a real fare.
          </p>
        </div>
      </Panel>

      <Panel aria-labelledby="lead-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="lead-h" className="text-lg font-medium text-ink">The model’s estimate at other lead times</h2>
            <p className="mt-1 text-sm text-mist">Same itinerary, only the days before departure changed. Each bar is a separate model run.</p>
          </div>
          <p className="flex items-center gap-2 font-mono text-xs text-fog"><Clock3 aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />1 to 50 days: {delta <= 0 ? '−' : '+'}{formatInr(Math.abs(delta))}</p>
        </div>
        <div className="mt-6"><BarList rows={profileRows} format={formatInr} highlight={it.days_left} /></div>
        <p className="mt-4 text-xs text-fog">Bars start at ₹0. The highlighted bar is your selected lead time when it is one of the values shown.</p>
      </Panel>

      <Panel aria-labelledby="drivers-h">
        <h2 id="drivers-h" className="text-lg font-medium text-ink">What the model pays attention to</h2>
        <p className="mt-1 text-sm text-mist">General patterns in the model, with each factor’s share of its overall attention (SHAP). They describe associations in the training data, not causes.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {result.drivers.map((d) => (
            <li key={d.factor} className="rounded-xl border border-ink/[0.08] bg-night-850 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{d.factor}</p>
                <span className="font-mono text-xs text-fog">{d.value}</span>
              </div>
              {shares[d.factor] != null && (
                <div className="mt-3 flex items-center gap-3">
                  <ShareMeter pct={shares[d.factor]} />
                  <span className="shrink-0 font-mono text-xs text-mist">{shares[d.factor]}%</span>
                </div>
              )}
              <p className="mt-3 text-sm leading-relaxed text-mist">{d.text}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel aria-labelledby="limits-h">
        <h2 id="limits-h" className="flex items-center gap-2 text-lg font-medium text-ink"><TriangleAlert aria-hidden="true" strokeWidth={1.5} className="h-[18px] w-[18px] text-horizon" />Limits of this estimate</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-mist">
          {result.limitations.map((l) => <li key={l} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fog" />{l}</li>)}
        </ul>
        <p className="mt-6 border-t border-ink/[0.08] pt-4 text-xs leading-relaxed text-fog">
          Model: {result.model.description}. Trained on {result.model.trained_on}; {result.model.training_period}. Evaluated on {result.model.evaluated_on}.
        </p>
      </Panel>
    </div>
  )
}
