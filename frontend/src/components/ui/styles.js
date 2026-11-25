// Shared class builders (kept out of component files for fast refresh)
const BUTTON = {
  // beacon cyan with stratosphere text: 10.9:1 contrast
  primary:
    'bg-cyan text-night-950 shadow-[0_12px_32px_-14px_rgb(98_212_238/0.75)] hover:bg-[#86e0f3] hover:-translate-y-px active:translate-y-0 active:scale-[0.985] ' +
    'disabled:bg-night-700 disabled:text-mist disabled:shadow-none disabled:translate-y-0 disabled:scale-100',
  secondary: 'border border-white/15 bg-white/[0.04] text-ink hover:border-white/35 hover:bg-white/[0.08] active:scale-[0.985] disabled:text-fog',
  ghost: 'text-mist hover:bg-white/[0.06] hover:text-ink',
}
export const buttonClass = (variant = 'primary', extra = '') =>
  `inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-[var(--ease-flight)] disabled:cursor-not-allowed ${BUTTON[variant]} ${extra}`
