import { buttonClass } from './styles'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { m, useReducedMotion } from 'framer-motion'

export const inputClass =
  'block w-full min-h-12 rounded-[0.875rem] border border-white/10 bg-night-950/55 px-4 text-base text-ink ' +
  'placeholder:text-fog transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/25 ' +
  'focus:border-cyan focus:bg-night-950/80 focus:outline-none focus:ring-4 focus:ring-cyan/20 ' +
  'disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-night-950/25 disabled:text-fog ' +
  'aria-[invalid=true]:border-danger/80 aria-[invalid=true]:ring-danger/15'

export function Panel({ children, className = '', as: Tag = 'section', ...rest }) {
  return <Tag className={`panel min-w-0 p-5 sm:p-7 ${className}`} {...rest}>{children}</Tag>
}
export const Card = Panel // backwards-compatible name

// Label + control + hint + error. `children` receives the aria props to spread on the control.
export function Field({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-mist">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="mt-2 text-[0.8125rem] leading-snug text-fog">{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

export function FieldError({ id, children }) {
  const reduce = useReducedMotion()
  return (
    <m.p id={id} initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="mt-2 flex gap-1.5 text-sm font-medium leading-snug text-danger">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{children}
    </m.p>
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
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fog transition group-focus-within:text-cyan" />
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <span className="absolute inset-0 rounded-full border-2 border-current opacity-20" />
      <span className="absolute inset-0 animate-[sweep_0.9s_linear_infinite] rounded-full border-2 border-transparent border-t-current" />
    </span>
  )
}

export function Alert({ tone = 'error', title, children, action }) {
  const tones = {
    error: 'border-danger/35 bg-danger/[0.08]',
    info: 'border-cyan/25 bg-cyan/[0.06]',
    warn: 'border-horizon/30 bg-horizon/[0.07]',
  }
  const iconTone = { error: 'text-danger', info: 'text-cyan', warn: 'text-horizon' }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex min-w-0 gap-3 rounded-2xl border p-4 text-ink sm:p-5 ${tones[tone]}`}>
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
export function BarList({ rows, format, highlight, max: maxOverride, labelWidth = 'sm:grid-cols-[12rem_minmax(0,1fr)_auto]' }) {
  const reduce = useReducedMotion()
  const max = maxOverride ?? Math.max(...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const on = r.key === highlight
        const w = max > 0 ? `${(r.value / max) * 100}%` : '0%'
        return (
          <li key={r.key} className={`grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)_auto] items-center gap-3 text-sm ${labelWidth}`}>
            <span className={`break-words leading-snug ${on ? 'font-semibold text-ink' : 'text-mist'}`}>{r.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
              <m.span
                className={`absolute inset-y-0 left-0 rounded-full ${on ? 'bg-cyan' : 'bg-white/30'}`}
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: w }}
                animate={reduce ? { width: w } : undefined}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className={`tabular text-right text-[0.8125rem] ${on ? 'font-semibold text-cyan' : 'text-mist'}`}>{format(r.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}
