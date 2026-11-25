import { m, useReducedMotion } from 'framer-motion'

// Cockpit-style gauge for a percentage (the model's typical error). Purely presentational: the value and caption
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
  const ticks = Array.from({ length: 31 }, (_, i) => START + (SWEEP / 30) * i)
  return (
    <figure className="relative mx-auto w-full max-w-[22rem]">
      <svg viewBox="0 0 200 172" className="w-full" aria-hidden="true">
        <circle cx="100" cy="100" r="94" fill="#060e1f" stroke="rgb(255 255 255 / 0.1)" />
        <circle cx="100" cy="100" r="86" fill="none" stroke="rgb(255 255 255 / 0.04)" />
        <path d={arc(START, START + SWEEP, 76)} stroke="rgb(255 255 255 / 0.07)" strokeWidth="6" fill="none" strokeLinecap="round" />
        <m.path d={arc(START, START + SWEEP, 76)} stroke="#62d4ee" strokeWidth="6" fill="none" strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: frac }} animate={reduce ? { pathLength: frac } : undefined}
          viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
        {ticks.map((a, i) => {
          const major = i % 10 === 0
          const [x0, y0] = polar(a, 66), [x1, y1] = polar(a, major ? 57 : 62)
          return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? 'rgb(255 255 255 / 0.5)' : 'rgb(255 255 255 / 0.2)'} strokeWidth={major ? 1.6 : 0.9} />
        })}
        {[0, 10, 20, 30].map((v) => {
          const [x, y] = polar(START + (SWEEP * v) / max, 46)
          return <text key={v} x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#a3b3c9" style={{ fontFamily: 'var(--font-display)' }}>{v}</text>
        })}
        <m.g style={{ originX: 0.5, originY: 1 }} initial={reduce ? false : { rotate: START + 90 }} whileInView={{ rotate: angle + 90 }}
          animate={reduce ? { rotate: angle + 90 } : undefined} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 60, damping: 12, delay: 0.2 }}>
          <path d="M100 100 L 98 98 L 100 30 L 102 98 Z" fill="#f2b05e" />
        </m.g>
        <circle cx="100" cy="100" r="6" fill="#0c1a32" stroke="#f2b05e" strokeWidth="1.5" />
      </svg>
      <figcaption className="-mt-6 text-center">
        <span className="display-lg block text-[3.25rem] text-ink tabular">{value}<span className="text-3xl text-mist">{unit}</span></span>
        <span className="mt-2 block text-sm font-semibold text-cyan">{label}</span>
        {sub && <span className="mt-1 block text-sm text-mist">{sub}</span>}
      </figcaption>
    </figure>
  )
}
