import { useMemo, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { IATA, project, routePairs } from '../lib/airports'
import { airlinesFor, destinationsFor } from '../lib/options'

const VB = { w: 600, h: 560, pad: 56 }
// Label placement for cities that sit close together (Ahmedabad/Mumbai, Bangalore/Chennai)
const LABEL = { Ahmedabad: [-12, -10, 'end'], Mumbai: [-12, 24, 'end'], Bangalore: [-12, 24, 'end'], Chennai: [12, 24, 'start'] }
const pt = (city) => {
  const p = project(city)
  return p ? [VB.pad + p[0] * (VB.w - 2 * VB.pad), VB.pad + p[1] * (VB.h - 2 * VB.pad)] : null
}
const arcPath = (a, b) => {
  const [x0, y0] = pt(a), [x1, y1] = pt(b)
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.hypot(dx, dy)
  const k = 0.18 * len
  return `M${x0} ${y0} Q${mx - (dy / len) * k} ${my + (dx / len) * k} ${x1} ${y1}`
}

// Supported city pairs drawn between real city positions. The city buttons are the accessible control;
// the drawing mirrors their state and is hidden from assistive tech.
export default function RouteMap({ options }) {
  const reduce = useReducedMotion()
  const [active, setActive] = useState(null)
  const pairs = useMemo(() => routePairs(options), [options])
  const stats = useMemo(() => Object.fromEntries(options.cities.map((c) => {
    const dests = destinationsFor(options, c)
    const airlines = new Set(dests.flatMap((d) => airlinesFor(options, c, d)))
    return [c, { dests, airlines: airlines.size }]
  })), [options])
  const sel = active ?? options.cities[0]
  const s = stats[sel]

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
      <div className="relative min-w-0">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-auto w-full" aria-hidden="true">
          <defs>
            <radialGradient id="city-glow"><stop offset="0" stopColor="#f2b05e" stopOpacity="0.55" /><stop offset="1" stopColor="#f2b05e" stopOpacity="0" /></radialGradient>
          </defs>
          {/* latitude guides: an instrument grid, not a coastline */}
          {[0.2, 0.4, 0.6, 0.8].map((f) => <line key={f} x1="0" x2={VB.w} y1={VB.h * f} y2={VB.h * f} stroke="rgb(255 255 255 / 0.05)" strokeDasharray="2 10" />)}
          {pairs.map(([a, b], i) => {
            const on = a === sel || b === sel
            return (
              <m.path key={`${a}-${b}`} d={arcPath(a, b)} fill="none" strokeLinecap="round"
                stroke={on ? '#62d4ee' : 'rgb(255 255 255 / 0.13)'} strokeWidth={on ? 2 : 1.1}
                initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1.2, delay: 0.03 * i, ease: [0.22, 1, 0.36, 1] }}
                style={{ transition: 'stroke 300ms, stroke-width 300ms' }} />
            )
          })}
          {options.cities.map((c) => {
            const p = pt(c)
            if (!p) return null
            const on = c === sel
            return (
              <g key={c} transform={`translate(${p[0]} ${p[1]})`}>
                <circle r={on ? 30 : 20} fill="url(#city-glow)" style={{ transition: 'r 300ms' }} />
                <circle r={on ? 6.5 : 5} fill={on ? '#f2b05e' : '#c99353'} stroke="#060e1f" strokeWidth="2" />
                <text x={LABEL[c]?.[0] ?? 12} y={LABEL[c]?.[1] ?? -10} textAnchor={LABEL[c]?.[2] ?? 'start'} fontSize="22" fontWeight="680" fill={on ? '#edf2f8' : '#a3b3c9'} style={{ fontFamily: 'var(--font-display)' }}>{IATA[c]}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-mist">Choose a city to see where the model has fares from it.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Cities">
          {options.cities.map((c) => (
            <button key={c} type="button" aria-pressed={c === sel} onClick={() => setActive(c)} onMouseEnter={() => setActive(c)} onFocus={() => setActive(c)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-4 text-sm font-medium text-mist transition hover:border-white/30 hover:text-ink aria-pressed:border-horizon/60 aria-pressed:bg-horizon/10 aria-pressed:text-ink">
              <span className="display-md text-base text-horizon">{IATA[c]}</span>{c}
            </button>
          ))}
        </div>
        <div className="mt-8 border-t border-white/[0.08] pt-6" aria-live="polite">
          <p className="display-lg text-[clamp(2.5rem,5vw,3.75rem)] text-ink">{sel}</p>
          <dl className="mt-4 grid grid-cols-2 gap-6">
            <div><dt className="text-sm text-mist">Destinations</dt><dd className="display-md mt-1 text-4xl text-ink tabular">{s.dests.length}</dd></div>
            <div><dt className="text-sm text-mist">Airlines flying from here</dt><dd className="display-md mt-1 text-4xl text-ink tabular">{s.airlines}</dd></div>
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-mist">To {s.dests.join(', ')}.</p>
        </div>
      </div>
    </div>
  )
}
