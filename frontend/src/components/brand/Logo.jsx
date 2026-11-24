// AirfareIndex mark: a rising flight path crossing an index baseline.
export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4c8dff" />
          <stop offset="1" stopColor="#3fd0ee" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="#0a1628" stroke="rgb(255 255 255 / 0.12)" />
      <path d="M8 28.5 H32" stroke="rgb(255 255 255 / 0.18)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.5 27 C 15 26, 20 22, 24 16.5 S 30 9.5, 32 9" fill="none" stroke="url(#lm-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27.4 9.6 L 32.6 8.6 L 30.6 13.4" fill="none" stroke="#3fd0ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="27" r="1.9" fill="#f2b66d" />
    </svg>
  )
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-ink">Airfare<span className="text-cyan">Index</span></span>
    </span>
  )
}
