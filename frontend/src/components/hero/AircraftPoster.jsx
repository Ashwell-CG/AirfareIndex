// Static, lightweight stand-in for the WebGL aircraft: shown while the 3D chunk loads and whenever WebGL is unavailable.
export default function AircraftPoster({ className = '' }) {
  return (
    <svg viewBox="0 0 640 260" className={className} role="img" aria-label="Illustration of a passenger aircraft in flight">
      <defs>
        <linearGradient id="ap-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f6fb" />
          <stop offset="0.55" stopColor="#c9d3e1" />
          <stop offset="1" stopColor="#7d8ba3" />
        </linearGradient>
        <linearGradient id="ap-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b3a6b" />
          <stop offset="1" stopColor="#0a1a36" />
        </linearGradient>
        <radialGradient id="ap-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#62d4ee" stopOpacity="0.18" />
          <stop offset="1" stopColor="#62d4ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="330" cy="140" rx="320" ry="120" fill="url(#ap-glow)" />
      {/* far wing */}
      <path d="M300 128 L 392 70 L 418 70 L 352 128 Z" fill="#9aa8bd" opacity="0.7" />
      {/* fin */}
      <path d="M98 100 L 62 26 L 96 26 L 168 100 Z" fill="url(#ap-navy)" />
      <path d="M104 86 L 84 50 L 98 50 L 124 86 Z" fill="#62d4ee" opacity="0.9" />
      {/* fuselage */}
      <path d="M52 108 C 60 98 92 94 126 94 L 500 94 C 552 94 592 104 612 120 C 594 134 552 142 500 142 L 140 142 C 100 142 68 132 52 118 Z" fill="url(#ap-skin)" />
      <path d="M150 124 L 500 124" stroke="#62d4ee" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M160 110 L 490 110" stroke="#0b1628" strokeWidth="5" strokeDasharray="3.5 8.5" strokeLinecap="round" />
      <path d="M560 104 L 584 108 L 590 114 L 566 112 Z" fill="#0b1628" />
      {/* stabiliser */}
      <path d="M78 112 L 40 124 L 58 126 L 120 116 Z" fill="#aab6c8" />
      {/* near wing + engine */}
      <path d="M318 128 L 236 196 L 262 196 L 368 132 Z" fill="#b9c4d4" />
      <rect x="292" y="146" width="88" height="26" rx="13" fill="url(#ap-navy)" />
      <rect x="368" y="149" width="10" height="20" rx="5" fill="#62d4ee" opacity="0.85" />
    </svg>
  )
}
