import { buttonClass } from './styles'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { m, useReducedMotion } from 'framer-motion'

export const inputClass =
  'block w-full min-h-12 rounded-[10px] border border-ink/10 bg-night-850 px-4 text-base text-ink ' +
  'placeholder:text-fog transition-[border-color,background-color] duration-150 hover:border-ink/20 ' +
  'focus:border-cyan focus:bg-night-800 focus:outline-none focus:ring-2 focus:ring-cyan/40 ' +
  'disabled:cursor-not-allowed disabled:border-ink/5 disabled:bg-night-900 disabled:text-fog ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/30'

export function Panel({ children, className = '', as: Tag = 'section', ...rest }) {
  return <Tag className={`panel min-w-0 p-5 sm:p-6 ${className}`} {...rest}>{children}</Tag>
}
export const Card = Panel // backwards-compatible name

// Label + control + hint + error. `children` receives the aria props to spread on the control.
export function Field({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-mist">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="mt-2 text-[13px] leading-5 text-fog">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}

export function SelectInput({ options, placeholder, value, ...props }) {
  return (
    <div className="group relative">
      <select value={value} className={`${inputClass} cursor-pointer appearance-none pr-12 disabled:cursor-not-allowed`} {...props}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? o : o.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
      <ChevronDown aria-hidden="true" strokeWidth={1.5} className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <span className="absolute inset-0 rounded-full border-2 border-ink/15" />
      <span className="absolute inset-0 animate-[sweep_0.9s_linear_infinite] rounded-full border-2 border-transparent border-t-current" />
    </span>
  )
}

export function Alert({ tone = 'error', title, children, action }) {
  const tones = { error: 'border-danger/30', info: 'border-ink/10', warn: 'border-horizon/30' }
  const iconTone = { error: 'text-danger', info: 'text-fog', warn: 'text-horizon' }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex min-w-0 gap-3 rounded-2xl border bg-night-900 p-4 text-ink ${tones[tone]}`}>
      <Icon aria-hidden="true" strokeWidth={1.5} className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${iconTone}`} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className="font-medium text-ink">{title}</p>}
        <div className={`text-mist ${title ? 'mt-1' : ''}`}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  return <button className={buttonClass(variant, className)} {...props}>{children}</button>
}

// Horizontal bars measured from zero. One accent bar for the value that matters; the rest are neutral.
// Bars grow with a transform (scaleX), never by animating width.
export function BarList({ rows, format, highlight, max: maxOverride }) {
  const reduce = useReducedMotion()
  const max = maxOverride ?? Math.max(...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const on = r.key === highlight
        return (
          <li key={r.key} className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
            <span className={`break-words leading-snug ${on ? 'font-medium text-ink' : 'text-mist'}`}>{r.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden="true">
              <m.span
                className={`absolute inset-y-0 left-0 origin-left rounded-full ${on ? 'bg-cyan' : 'bg-ink/25'}`}
                style={{ width: `${(r.value / max) * 100}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.5, delay: 0.04 * Math.min(i, 6), ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className={`tabular text-right font-mono text-xs ${on ? 'text-cyan' : 'text-mist'}`}>{format(r.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}
