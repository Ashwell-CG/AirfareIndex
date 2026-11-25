// Section title and lede. Static on purpose: the page has one entrance (the hero), nothing else flies in.
export function SectionHeading({ title, children, id }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="font-display text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.06] tracking-[-0.02em] text-ink">{title}</h2>
      {children && <div className="mt-4 text-base leading-relaxed text-mist sm:text-lg">{children}</div>}
    </div>
  )
}
