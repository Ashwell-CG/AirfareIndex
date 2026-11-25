import { useEffect, useRef, useState } from 'react'
import { animate, m, useReducedMotion } from 'framer-motion'
import { formatInr } from '../../lib/format'

const EASE = [0.22, 1, 0.36, 1]

// Counts up to the new fare. The animated digits are decorative; the exact value is always present for assistive tech.
export function CountUp({ value, testId }) {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const prev = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const from = prev.current ?? value * 0.82
    prev.current = value
    if (reduce) { el.textContent = formatInr(value); return undefined }
    const c = animate(from, value, { duration: 1.1, ease: EASE, onUpdate: (v) => { el.textContent = formatInr(v) } })
    return () => c.stop()
  }, [value, reduce])
  return (
    <>
      <span ref={ref} aria-hidden="true" className="tabular">{formatInr(value)}</span>
      <span className="sr-only" data-testid={testId}>{formatInr(value)}</span>
    </>
  )
}

// Quadratic flight arc between two airports with a plane travelling along it. Amber marks the origin.
const P0 = [16, 64], P1 = [150, -8], P2 = [284, 64]
const bez = (t) => [0, 1].map((k) => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t ** 2 * P2[k])
const tangent = (t) => Math.atan2(2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]), 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0])) * (180 / Math.PI)

export function RouteArc({ runKey, loop = false, className = '' }) {
  const reduce = useReducedMotion()
  const [t, setT] = useState(reduce ? 1 : 0)
  useEffect(() => {
    if (reduce) return undefined // static: initial state already shows the completed arc
    const c = animate(0, 1, { duration: loop ? 2.4 : 1.2, ease: loop ? 'linear' : EASE, repeat: loop ? Infinity : 0, onUpdate: setT })
    return () => c.stop()
  }, [runKey, loop, reduce])
  const [x, y] = bez(t)
  const d = `M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`
  return (
    <svg viewBox="0 0 300 78" className={className} aria-hidden="true">
      <path d={d} fill="none" stroke="rgb(234 240 249 / 0.14)" strokeWidth="1.5" strokeDasharray="3 6" />
      <m.path d={d} fill="none" stroke="#3fd0ee" strokeWidth="2" strokeLinecap="round" style={{ pathLength: loop ? 1 : t }} opacity={loop ? 0.35 : 1} />
      <circle cx={P0[0]} cy={P0[1]} r="4" fill="#f2b66d" />
      <circle cx={P2[0]} cy={P2[1]} r="4" fill="#0a1628" stroke="rgb(234 240 249 / 0.6)" strokeWidth="2" />
      <g transform={`translate(${x} ${y}) rotate(${tangent(Math.min(Math.max(t, 0.001), 0.999))})`}>
        <path d="M8 0 L -5 -6.5 L -3 0 L -5 6.5 Z" fill="#eaf0f9" />
      </g>
    </svg>
  )
}

// The result enters once: a short fade and an 8px rise. No tilt, no spring.
export function Enter({ children }) {
  const reduce = useReducedMotion()
  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      {children}
    </m.div>
  )
}

// Thin meter showing a factor's share of the model's total SHAP attribution (grows with scaleX, not width)
export function ShareMeter({ pct, max = 60 }) {
  const reduce = useReducedMotion()
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden="true">
      <m.span className="absolute inset-y-0 left-0 origin-left rounded-full bg-ink/60" style={{ width: `${Math.min(pct / max, 1) * 100}%` }}
        initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }}
        viewport={{ once: true }} transition={{ duration: 0.5, ease: EASE }} />
    </span>
  )
}
