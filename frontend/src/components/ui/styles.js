// Shared class builders (kept out of component files for fast refresh)
const BUTTON = {
  primary:
    'text-white bg-[linear-gradient(135deg,var(--color-azure),var(--color-azure-strong))] shadow-[0_10px_30px_-12px_rgb(76_141_255/0.8),inset_0_1px_0_rgb(255_255_255/0.25)] ' +
    'hover:shadow-[0_14px_34px_-10px_rgb(76_141_255/0.9),inset_0_1px_0_rgb(255_255_255/0.3)] hover:-translate-y-px active:translate-y-0 ' +
    'disabled:bg-none disabled:bg-night-700 disabled:text-mist disabled:shadow-none disabled:translate-y-0',
  secondary: 'border border-white/15 bg-white/[0.04] text-ink hover:border-white/30 hover:bg-white/[0.08] disabled:text-fog',
  ghost: 'text-mist hover:bg-white/[0.06] hover:text-ink',
}
export const buttonClass = (variant = 'primary', extra = '') =>
  `inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-[var(--ease-flight)] disabled:cursor-not-allowed ${BUTTON[variant]} ${extra}`

