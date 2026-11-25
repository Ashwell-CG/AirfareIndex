import { useEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { formatInr } from '../../lib/format'

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
    const c = animate(from, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = formatInr(v) } })
    return () => c.stop()
  }, [value, reduce])
  return (
    <>
      <span ref={ref} aria-hidden="true" className="tabular">{formatInr(value)}</span>
      <span className="sr-only" data-testid={testId}>{formatInr(value)}</span>
    </>
  )
}

// Quadratic flight arc between two airports with a plane travelling along it.
const P0 = [16, 64], P1 = [150, -8], P2 = [284, 64]
const bez = (t) => [0, 1].map((k) => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t ** 2 * P2[k])
const tangent = (t) => Math.atan2(2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]), 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0])) * (180 / Math.PI)

export function RouteArc({ runKey, loop = false, className = '' }) {
  const reduce = useReducedMotion()
  const [t, setT] = useState(reduce ? 1 : 0)
  useEffect(() => {
    if (reduce) return undefined // static: initial state already shows the completed arc
    const c = animate(0, 1, { duration: loop ? 2.4 : 1.6, ease: loop ? 'linear' : [0.45, 0, 0.2, 1], repeat: loop ? Infinity : 0, onUpdate: setT })
    return () => c.stop()
  }, [runKey, loop, reduce])
  const [x, y] = bez(t)
  const d = `M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`
  return (
    <svg viewBox="0 0 300 78" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="arc-g" x1="0" x2="1"><stop offset="0" stopColor="#4c8dff" /><stop offset="1" stopColor="#3fd0ee" /></linearGradient>
      </defs>
      <path d={d} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="1.5" strokeDasharray="3 6" />
      <m.path d={d} fill="none" stroke="url(#arc-g)" strokeWidth="2" strokeLinecap="round" style={{ pathLength: loop ? 1 : t }} opacity={loop ? 0.35 : 1} />
      <circle cx={P0[0]} cy={P0[1]} r="4" fill="#0a1628" stroke="#4c8dff" strokeWidth="2" />
      <circle cx={P2[0]} cy={P2[1]} r="4" fill="#0a1628" stroke="#3fd0ee" strokeWidth="2" />
      <g transform={`translate(${x} ${y}) rotate(${tangent(Math.min(Math.max(t, 0.001), 0.999))})`}>
        <circle r="11" fill="rgb(63 208 238 / 0.12)" />
        <path d="M8 0 L -5 -6.5 L -3 0 L -5 6.5 Z" fill="#eaf0f9" />
      </g>
    </svg>
  )
}

// Subtle pointer-driven 3D tilt for desktop pointers; inert on touch devices and with reduced motion.
export function TiltCard({ children, className = '', max = 4 }) {
  const reduce = useReducedMotion()
  const [fine] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  const mx = useMotionValue(0), my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [max, -max]), { stiffness: 140, damping: 18 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-max, max]), { stiffness: 140, damping: 18 })
  const active = fine && !reduce
  return (
    <m.div
      className="[perspective:1400px]"
      initial={reduce ? false : { opacity: 0, rotateX: 14, y: 24 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 90, damping: 16 }}
    >
      <m.div
        className={className}
        style={active ? { rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' } : undefined}
        onPointerMove={active ? (e) => {
          const r = e.currentTarget.getBoundingClientRect()
          mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5)
        } : undefined}
        onPointerLeave={active ? () => { mx.set(0); my.set(0) } : undefined}
      >
        {children}
      </m.div>
    </m.div>
  )
}

// Thin meter showing a factor's share of the model's total SHAP attribution
export function ShareMeter({ pct, max = 60 }) {
  const reduce = useReducedMotion()
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
      <m.span className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--color-azure),var(--color-cyan))]"
        initial={reduce ? false : { width: 0 }} whileInView={{ width: `${Math.min(pct / max, 1) * 100}%` }}
        animate={reduce ? { width: `${Math.min(pct / max, 1) * 100}%` } : undefined}
        viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </span>
  )
}
