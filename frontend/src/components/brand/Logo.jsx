// AirfareIndex mark: a rising flight path crossing an index baseline, departing from a sodium-lit city.
export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="39" height="39" rx="12" fill="#0c1a32" stroke="rgb(255 255 255 / 0.14)" />
      <path d="M8 28.5 H32" stroke="rgb(255 255 255 / 0.2)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.5 27 C 15 26, 20 22, 24 16.5 S 30 9.5, 32 9" fill="none" stroke="#62d4ee" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27.4 9.6 L 32.6 8.6 L 30.6 13.4" fill="none" stroke="#62d4ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="27" r="2.1" fill="#f2b05e" />
    </svg>
  )
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="display-md text-[1.5rem] leading-none text-ink">AirfareIndex</span>
    </span>
  )
}
