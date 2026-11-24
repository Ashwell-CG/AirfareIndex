import { m, useReducedMotion } from 'framer-motion'

// Fades content up as it scrolls into view. Respects reduced motion (renders in place).
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

export function SectionHeading({ eyebrow, title, children, align = 'left', id }) {
  return (
    <Reveal className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={id} className="mt-3 font-display text-[clamp(2.1rem,4.2vw,3.6rem)] leading-[1.04] tracking-[-0.01em] text-ink">{title}</h2>
      {children && <div className="mt-4 text-base leading-relaxed text-mist sm:text-lg">{children}</div>}
    </Reveal>
  )
}
