import { buttonClass } from './styles'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { m, useReducedMotion } from 'framer-motion'

export const inputClass =
  'block w-full min-h-12 rounded-xl border border-white/10 bg-night-850/90 px-3.5 text-base text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] ' +
  'placeholder:text-fog transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/20 ' +
  'focus:border-cyan focus:bg-night-800 focus:outline-none focus:ring-4 focus:ring-cyan/30 ' +
  'disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-night-900/60 disabled:text-fog ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15'

export function Panel({ children, className = '', as: Tag = 'section', ...rest }) {
  return <Tag className={`panel min-w-0 p-5 sm:p-6 ${className}`} {...rest}>{children}</Tag>
}
export const Card = Panel // backwards-compatible name

export function Eyebrow({ children, className = '' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

// Label + control + hint + error. `children` receives the aria props to spread on the control.
export function Field({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-mist">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] leading-snug text-fog">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}

export function SelectInput({ options, placeholder, value, ...props }) {
  return (
    <div className="group relative">
      <select value={value} className={`${inputClass} cursor-pointer appearance-none pr-11 disabled:cursor-not-allowed`} {...props}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? o : o.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-fog transition group-focus-within:rotate-180 group-focus-within:text-cyan" />
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <span className="absolute inset-0 rounded-full border-2 border-white/15" />
      <span className="absolute inset-0 animate-[sweep_0.9s_linear_infinite] rounded-full border-2 border-transparent border-t-cyan" />
    </span>
  )
}

export function Alert({ tone = 'error', title, children, action }) {
  const tones = {
    error: 'border-danger/30 bg-danger/[0.07] text-ink',
    info: 'border-cyan/25 bg-cyan/[0.06] text-ink',
    warn: 'border-horizon/30 bg-horizon/[0.07] text-ink',
  }
  const iconTone = { error: 'text-danger', info: 'text-cyan', warn: 'text-horizon' }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex min-w-0 gap-3 rounded-2xl border p-4 ${tones[tone]}`}>
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className={`text-mist ${title ? 'mt-1' : ''}`}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  return <button className={buttonClass(variant, className)} {...props}>{children}</button>
}

// Horizontal bars measured from zero; grow into place when they enter the viewport.
export function BarList({ rows, format, highlight, max: maxOverride }) {
  const reduce = useReducedMotion()
  const max = maxOverride ?? Math.max(...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const on = r.key === highlight
        return (
          <li key={r.key} className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
            <span className={`break-words leading-snug ${on ? 'font-semibold text-ink' : 'text-mist'}`}>{r.label}</span>
            <span className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
              <m.span
                className={`absolute inset-y-0 left-0 rounded-full ${on ? 'bg-[linear-gradient(90deg,var(--color-azure),var(--color-cyan))] shadow-[0_0_12px_rgb(63_208_238/0.6)]' : 'bg-white/25'}`}
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: `${(r.value / max) * 100}%` }}
                animate={reduce ? { width: `${(r.value / max) * 100}%` } : undefined}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className={`tabular text-right font-mono text-[0.8125rem] ${on ? 'font-medium text-cyan' : 'text-mist'}`}>{format(r.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}
