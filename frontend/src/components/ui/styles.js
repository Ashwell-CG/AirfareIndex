// Shared class builders (kept out of component files for fast refresh)
const BUTTON = {
  // solid accent with dark text (10:1), a soft top highlight instead of a glow
  primary:
    'bg-cyan text-night-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-[#6cdcf3] ' +
    'disabled:bg-night-800 disabled:text-fog disabled:shadow-none',
  secondary: 'border border-ink/10 bg-night-850 text-ink hover:border-ink/20 hover:bg-night-800 disabled:text-fog',
  ghost: 'text-mist hover:bg-night-850 hover:text-ink',
}
export const buttonClass = (variant = 'primary', extra = '') =>
  `inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-[10px] px-5 text-base font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-flight)] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${BUTTON[variant]} ${extra}`
