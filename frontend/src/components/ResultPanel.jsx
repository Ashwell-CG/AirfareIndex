import { useEffect, useRef } from 'react'
import { Clock3, Info, TriangleAlert } from 'lucide-react'
import Instrument from './Instrument'
import { FlapFare, RouteArc, ShareMeter, TiltCard } from './results/pieces'
import { BarList, Panel } from './ui/ui'
import { iata } from '../lib/airports'
import { formatDate } from '../lib/dates'
import { formatDuration, formatInr, formatTime, plural } from '../lib/format'
import { STOPS_LABEL } from '../lib/options'

function Stub({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-mist">{label}</dt>
      <dd className="mt-1 break-words text-[0.9375rem] font-semibold text-ink">{children}</dd>
    </div>
  )
}

function BoardingPass({ result, stale, headingRef, travelDate }) {
  const it = result.itinerary
  return (
    <TiltCard>
      <section aria-labelledby="result-h" className="glass relative overflow-hidden rounded-[2rem]">
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="result-h" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-cyan focus:outline-none">Model estimate</h2>
            <p className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[0.8125rem] font-semibold text-ink">{it.airline}</span>
              <span className="rounded-full bg-cyan px-3 py-1 text-[0.8125rem] font-semibold text-night-950">{it.travel_class}</span>
            </p>
          </div>

          <div className="mt-7 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5">
            <div className="text-left">
              <p className="display-xl text-[clamp(2.75rem,8vw,4.5rem)] text-ink">{iata(it.source)}</p>
              <p className="mt-1 text-sm text-mist">{it.source}</p>
            </div>
            <RouteArc runKey={`${it.source}-${it.destination}-${result.predicted_fare_inr}`} className="h-auto w-full" />
            <div className="text-right">
              <p className="display-xl text-[clamp(2.75rem,8vw,4.5rem)] text-ink">{iata(it.destination)}</p>
              <p className="mt-1 text-sm text-mist">{it.destination}</p>
            </div>
          </div>
          <p className="sr-only">Route: {it.source} to {it.destination}</p>

          <div className="mt-8">
            <p className="display-xl text-[clamp(3.5rem,12vw,7rem)] text-ink">
              <FlapFare value={result.predicted_fare_inr} testId="predicted-fare" />
            </p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-mist">Estimated one-way fare in {result.currency}, from historical listed fares. It is not a live price or a quote from any airline.</p>
          </div>
          {stale && <p role="status" className="mt-5 rounded-2xl border border-horizon/35 bg-horizon/10 px-4 py-3 text-sm text-ink">You changed the form. Select “Estimate fare” to update this estimate.</p>}
        </div>

        {/* perforation */}
        <div className="relative h-0" aria-hidden="true">
          <span className="absolute -left-3.5 -top-3.5 h-7 w-7 rounded-full bg-night-950" />
          <span className="absolute -right-3.5 -top-3.5 h-7 w-7 rounded-full bg-night-950" />
          <span className="absolute inset-x-6 top-0 border-t border-dashed border-white/20" />
        </div>

        <div className="relative p-6 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {travelDate && <Stub label="Travel date">{formatDate(travelDate)}</Stub>}
            <Stub label="Booked ahead">{plural(it.days_left, 'day')}</Stub>
            <Stub label="Departure">{formatTime(it.departure_time).split(' (')[0]}</Stub>
            <Stub label="Stops">{STOPS_LABEL[it.stops] ?? it.stops}</Stub>
            <Stub label="Duration">{formatDuration(it.duration_hours)}</Stub>
            <Stub label="Model">{result.model.name}</Stub>
          </dl>
          {!result.departure_time_used_by_model && (
            <p className="mt-6 flex gap-2 text-[0.8125rem] leading-snug text-fog"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />This model version does not use departure time: a different time gives the same estimate.</p>
          )}
        </div>
      </section>
    </TiltCard>
  )
}

export default function ResultPanel({ result, stale, insights, travelDate }) {
  const heading = useRef(null)
  useEffect(() => {
    const el = heading.current
    el?.focus({ preventScroll: true })
    // Bring the fare into view when its top is hidden (stacked layout, or a long form scrolled down on desktop)
    const top = el?.getBoundingClientRect().top ?? 0
    if (top < 80 || top > window.innerHeight * 0.6) el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
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
      <BoardingPass result={result} stale={stale} headingRef={heading} travelDate={travelDate} />

      <Panel aria-labelledby="error-h" className="grid items-center gap-8 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[15rem]"><Instrument value={te.value_pct} label="Typical error" sub="Unseen flights, median" /></div>
        <div>
          <h2 id="error-h" className="display-md text-[1.875rem] text-ink">How close are estimates like this?</h2>
          <p className="mt-3 leading-relaxed text-mist">
            On flights the model had not seen in training, its typical error was about <strong className="text-ink">{te.value_pct}%</strong> (median absolute percentage error, ±{te.sd_across_draws_pct} points across {te.draws} evaluation draws).
          </p>
          <p className="mt-4 border-l-2 border-horizon/70 pl-4 text-sm leading-relaxed text-mist">
            <strong className="text-ink">This is a model-level statistic, not a confidence score for this prediction.</strong> This particular estimate could be closer to, or further from, a real fare.
          </p>
        </div>
      </Panel>

      <Panel aria-labelledby="lead-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="lead-h" className="display-md text-[1.875rem] text-ink">The model’s estimate at other lead times</h2>
            <p className="mt-2 text-sm text-mist">Same itinerary, only the days before departure changed. Each bar is a separate model run.</p>
          </div>
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-fog tabular"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />1 to 50 days: {delta <= 0 ? '−' : '+'}{formatInr(Math.abs(delta))}</p>
        </div>
        <div className="mt-6"><BarList rows={profileRows} format={formatInr} highlight={it.days_left} /></div>
        <p className="mt-4 text-xs text-fog">Bars start at ₹0. Your lead time is highlighted when it is one of the values shown.</p>
      </Panel>

      <Panel aria-labelledby="drivers-h">
        <h2 id="drivers-h" className="display-md text-[1.875rem] text-ink">What the model pays attention to</h2>
        <p className="mt-2 text-sm text-mist">General patterns in the model, with each factor’s share of its overall attention (SHAP). They describe associations in the training data, not causes.</p>
        <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {result.drivers.map((d) => (
            <li key={d.factor} className="min-w-0 border-t border-white/[0.08] pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{d.factor}</p>
                <span className="text-[0.8125rem] text-mist">{d.value}</span>
              </div>
              {shares[d.factor] != null && (
                <div className="mt-3 flex items-center gap-3">
                  <ShareMeter pct={shares[d.factor]} />
                  <span className="shrink-0 text-[0.8125rem] font-semibold text-cyan tabular">{shares[d.factor]}%</span>
                </div>
              )}
              <p className="mt-3 text-sm leading-relaxed text-mist">{d.text}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel aria-labelledby="limits-h" className="border-horizon/25">
        <h2 id="limits-h" className="flex items-center gap-2 text-lg font-semibold text-ink"><TriangleAlert aria-hidden="true" className="h-5 w-5 text-horizon" />Limits of this estimate</h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-mist">
          {result.limitations.map((l) => <li key={l} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-horizon" />{l}</li>)}
        </ul>
        <p className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-relaxed text-fog">
          Model: {result.model.description}. Trained on {result.model.trained_on}; {result.model.training_period}. Evaluated on {result.model.evaluated_on}.
        </p>
      </Panel>
    </div>
  )
}
