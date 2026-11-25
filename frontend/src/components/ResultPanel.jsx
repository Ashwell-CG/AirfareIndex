import { useEffect, useRef } from 'react'
import { Clock3, Info, PlaneTakeoff, TriangleAlert } from 'lucide-react'
import Instrument from './Instrument'
import { CountUp, RouteArc, ShareMeter, TiltCard } from './results/pieces'
import { BarList, Panel } from './ui/ui'
import { iata } from '../lib/airports'
import { formatDuration, formatInr, formatTime, plural } from '../lib/format'
import { STOPS_LABEL } from '../lib/options'

function Stub({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xs uppercase tracking-[0.12em] text-fog">{label}</dt>
      <dd className="mt-1 break-words text-[0.9375rem] font-semibold text-ink">{children}</dd>
    </div>
  )
}

function BoardingPass({ result, stale, headingRef }) {
  const it = result.itinerary
  return (
    <TiltCard>
      <section aria-labelledby="result-h" className="panel overflow-hidden p-0 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.95),0_0_0_1px_rgb(63_208_238/0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_100%_0%,rgb(63_208_238/0.12),transparent_60%),radial-gradient(60%_60%_at_0%_100%,rgb(76_141_255/0.1),transparent_60%)]" aria-hidden="true" />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="result-h" ref={headingRef} tabIndex={-1} className="eyebrow focus:outline-none">Model estimate</h2>
            <p className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-ink">{it.airline}</span>
              <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">{it.travel_class}</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
            <div className="text-left">
              <p className="font-mono text-[clamp(1.75rem,6vw,2.75rem)] font-medium leading-none tracking-tight text-ink">{iata(it.source)}</p>
              <p className="mt-1.5 text-sm text-mist">{it.source}</p>
            </div>
            <RouteArc runKey={`${it.source}-${it.destination}-${result.predicted_fare_inr}`} className="h-auto w-full" />
            <div className="text-right">
              <p className="font-mono text-[clamp(1.75rem,6vw,2.75rem)] font-medium leading-none tracking-tight text-ink">{iata(it.destination)}</p>
              <p className="mt-1.5 text-sm text-mist">{it.destination}</p>
            </div>
          </div>
          <p className="sr-only">Route: {it.source} to {it.destination}</p>

          <div className="mt-7">
            <p className="font-display text-[clamp(3.25rem,10vw,5.5rem)] leading-[0.9] text-ink">
              <CountUp value={result.predicted_fare_inr} testId="predicted-fare" />
            </p>
            <p className="mt-2 text-sm text-mist">Estimated one-way fare in {result.currency}. Based on historical listed fares, not a live price.</p>
          </div>
          {stale && <p role="status" className="mt-4 rounded-xl border border-horizon/30 bg-horizon/10 px-4 py-2.5 text-sm text-ink">You changed the form. Select “Estimate fare” to update this estimate.</p>}
        </div>

        {/* perforation */}
        <div className="relative h-0" aria-hidden="true">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-night-950" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-night-950" />
          <span className="absolute inset-x-5 top-0 border-t border-dashed border-white/15" />
        </div>

        <div className="relative p-5 sm:p-7">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <Stub label="Departure">{formatTime(it.departure_time).split(' (')[0]}</Stub>
            <Stub label="Stops">{STOPS_LABEL[it.stops] ?? it.stops}</Stub>
            <Stub label="Duration">{formatDuration(it.duration_hours)}</Stub>
            <Stub label="Booked ahead">{plural(it.days_left, 'day')}</Stub>
          </dl>
          {!result.departure_time_used_by_model && (
            <p className="mt-5 flex gap-2 text-[0.8125rem] leading-snug text-fog"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />This model version does not use departure time: a different time gives the same estimate.</p>
          )}
        </div>
      </section>
    </TiltCard>
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
    <div className="space-y-5" aria-live="polite">
      <BoardingPass result={result} stale={stale} headingRef={heading} />

      <Panel aria-labelledby="error-h" className="grid items-center gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <Instrument value={te.value_pct} label="Typical error" sub="Unseen flights, median" />
        <div>
          <h2 id="error-h" className="text-lg font-semibold text-ink">How accurate are estimates like this?</h2>
          <p className="mt-2 leading-relaxed text-mist">
            On flights the model had not seen in training, its typical error was about <strong className="text-ink">{te.value_pct}%</strong> (median absolute percentage error, ±{te.sd_across_draws_pct} points across {te.draws} evaluation draws).
          </p>
          <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm leading-relaxed text-mist">
            <strong className="text-ink">This is a model-level statistic, not a confidence score for this prediction.</strong> This particular estimate could be closer to, or further from, a real fare.
          </p>
        </div>
      </Panel>

      <Panel aria-labelledby="lead-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="lead-h" className="text-lg font-semibold text-ink">The model’s estimate at other lead times</h2>
            <p className="mt-1 text-sm text-mist">Same itinerary, only the days before departure changed. Each bar is a separate model run.</p>
          </div>
          <p className="flex items-center gap-1.5 font-mono text-xs text-fog"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />1 → 50 days: {delta <= 0 ? '−' : '+'}{formatInr(Math.abs(delta))}</p>
        </div>
        <div className="mt-5"><BarList rows={profileRows} format={formatInr} highlight={it.days_left} /></div>
        <p className="mt-4 text-xs text-fog">Bars start at ₹0. The highlighted bar is your selected lead time when it is one of the values shown.</p>
      </Panel>

      <Panel aria-labelledby="drivers-h">
        <h2 id="drivers-h" className="text-lg font-semibold text-ink">What the model pays attention to</h2>
        <p className="mt-1 text-sm text-mist">General patterns in the model, with each factor’s share of its overall attention (SHAP). They describe associations in the training data, not causes.</p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {result.drivers.map((d) => (
            <li key={d.factor} className="rounded-xl border border-white/[0.07] bg-night-850/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{d.factor}</p>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono text-xs text-mist">{d.value}</span>
              </div>
              {shares[d.factor] != null && (
                <div className="mt-3 flex items-center gap-3">
                  <ShareMeter pct={shares[d.factor]} />
                  <span className="shrink-0 font-mono text-xs text-cyan">{shares[d.factor]}%</span>
                </div>
              )}
              <p className="mt-3 text-sm leading-relaxed text-mist">{d.text}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel aria-labelledby="limits-h" className="border-horizon/20 bg-[linear-gradient(180deg,rgb(242_182_109/0.06),transparent_60%)]">
        <h2 id="limits-h" className="flex items-center gap-2 text-lg font-semibold text-ink"><TriangleAlert aria-hidden="true" className="h-5 w-5 text-horizon" />Please read: limits of this estimate</h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-mist">
          {result.limitations.map((l) => <li key={l} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-horizon" />{l}</li>)}
        </ul>
        <p className="mt-5 flex gap-2 border-t border-white/[0.07] pt-4 text-xs leading-relaxed text-fog">
          <PlaneTakeoff aria-hidden="true" className="h-4 w-4 shrink-0" />Model: {result.model.description}. Trained on {result.model.trained_on}; {result.model.training_period}. Evaluated on {result.model.evaluated_on}.
        </p>
      </Panel>
    </div>
  )
}
