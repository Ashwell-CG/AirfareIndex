import { m, useReducedMotion } from 'framer-motion'

// Cockpit-style gauge for a percentage (used for the model's typical error). Purely presentational: the value and caption
// are rendered as text too, so nothing depends on reading the needle.
const START = -210, SWEEP = 240 // degrees
const polar = (deg, r) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)]
const arc = (a0, a1, r) => {
  const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export default function Instrument({ value, max = 30, label = 'Typical error', unit = '%', sub }) {
  const reduce = useReducedMotion()
  const frac = Math.min(Math.max(value / max, 0), 1)
  const angle = START + SWEEP * frac
  const ticks = Array.from({ length: 13 }, (_, i) => START + (SWEEP / 12) * i)
  return (
    <figure className="relative mx-auto w-full max-w-[22rem]">
      <svg viewBox="0 0 200 172" className="w-full" aria-hidden="true">
        <defs>
          <linearGradient id="inst-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4ade9b" />
            <stop offset="0.5" stopColor="#3fd0ee" />
            <stop offset="1" stopColor="#f2b66d" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="92" fill="#07101f" stroke="rgb(255 255 255 / 0.08)" />
        <path d={arc(START, START + SWEEP, 78)} stroke="rgb(255 255 255 / 0.07)" strokeWidth="9" fill="none" strokeLinecap="round" />
        <m.path d={arc(START, START + SWEEP, 78)} stroke="url(#inst-g)" strokeWidth="9" fill="none" strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: frac }} animate={reduce ? { pathLength: frac } : undefined}
          viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
        {ticks.map((a, i) => {
          const [x0, y0] = polar(a, 64), [x1, y1] = polar(a, i % 3 === 0 ? 56 : 60)
          return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgb(255 255 255 / 0.28)" strokeWidth={i % 3 === 0 ? 1.6 : 1} />
        })}
        {[0, 10, 20, 30].map((v) => {
          const [x, y] = polar(START + (SWEEP * v) / max, 45)
          return <text key={v} x={x} y={y + 3} textAnchor="middle" fontSize="9.5" fill="#8d9cb4" fontFamily="IBM Plex Mono, monospace">{v}</text>
        })}
        <m.g style={{ originX: 0.5, originY: 1 }} initial={reduce ? false : { rotate: START + 90 }} whileInView={{ rotate: angle + 90 }}
          animate={reduce ? { rotate: angle + 90 } : undefined} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 60, damping: 12, delay: 0.2 }}>
          <path d="M100 100 L 97.5 98 L 100 32 L 102.5 98 Z" fill="#eaf0f9" />
        </m.g>
        <circle cx="100" cy="100" r="7" fill="#0e1d35" stroke="#3fd0ee" strokeWidth="1.5" />
      </svg>
      <figcaption className="-mt-10 text-center">
        <span className="block font-display text-5xl leading-none text-ink tabular">{value}<span className="text-3xl text-mist">{unit}</span></span>
        <span className="mt-2 block font-mono text-xs uppercase tracking-[0.14em] text-cyan">{label}</span>
        {sub && <span className="mt-1.5 block text-sm text-mist">{sub}</span>}
      </figcaption>
    </figure>
  )
}
