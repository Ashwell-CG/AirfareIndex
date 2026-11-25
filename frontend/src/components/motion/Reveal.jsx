import { m, useReducedMotion } from 'framer-motion'

// Fades content up as it scrolls into view. Respects reduced motion (renders in place). Use sparingly.
export function Reveal({ children, delay = 0, y = 18, className = '', as = 'div', amount = 0.25 }) {
  const reduce = useReducedMotion()
  const M = m[as] ?? m.div
  return (
    <M className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </M>
  )
}

export function SectionHeading({ title, children, id, className = '' }) {
  return (
    <div className={`max-w-3xl ${className}`}>
      <h2 id={id} className="display-lg text-[clamp(2.5rem,5vw,4.5rem)] text-ink">{title}</h2>
      {children && <div className="mt-4 text-base leading-relaxed text-mist sm:text-lg">{children}</div>}
    </div>
  )
}
