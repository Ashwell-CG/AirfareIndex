import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plane } from 'lucide-react'
import { Button, Field, SelectInput, Spinner, inputClass } from './ui/ui'
import { hoursToHM } from '../lib/format'
import { STOPS_LABEL, airlinesFor, classesFor, destinationsFor, durationHint, durationRange, sourceCities } from '../lib/options'
import { INITIAL_VALUES, cascade } from '../lib/formState'
import { validateForm } from '../lib/validate'

const SERVER_FIELD = { duration_hours: 'duration' }

export default function PredictionForm({ options, onSubmit, onDirty, submitting = false, serverFields = [] }) {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [durationEdited, setDurationEdited] = useState(false)

  const { errors, payload } = useMemo(() => validateForm(values, options), [values, options])
  const server = useMemo(() => Object.fromEntries(serverFields.filter((f) => f.field).map((f) => [SERVER_FIELD[f.field] ?? f.field, f.message])), [serverFields])
  const show = (k) => (submitted || touched[k] ? errors[k] : undefined) || (server[k] && !touched[`edited_${k}`] ? server[k] : undefined)

  const cities = useMemo(() => sourceCities(options), [options])
  const destinations = destinationsFor(options, values.source)
  const airlines = airlinesFor(options, values.source, values.destination)
  const classes = classesFor(options, values.airline, values.source, values.destination)
  const hint = values.source && values.destination ? durationHint(options, values.source, values.destination, values.stops) : null
  const range = durationRange(options, values.stops)
  const [dMin, dMax] = options.days_left_range

  function update(field, value) {
    setValues((prev) => {
      let next = cascade({ ...prev, [field]: value }, options)
      if (!durationEdited && ['source', 'destination', 'stops'].includes(field)) {
        const h = next.source && next.destination ? durationHint(options, next.source, next.destination, next.stops) : null
        const hm = h ? hoursToHM(h.typical) : { h: '', m: '' }
        next = { ...next, durH: String(hm.h), durM: String(hm.m) }
      }
      return next
    })
    setTouched((t) => ({ ...t, [field]: true, [`edited_${field}`]: true }))
    onDirty?.()
  }

  function updateDuration(field, value) {
    setDurationEdited(true)
    setValues((v) => ({ ...v, [field]: value.replace(/[^0-9]/g, '') }))
    setTouched((t) => ({ ...t, duration: true, edited_duration: true }))
    onDirty?.()
  }

  function useTypicalDuration() {
    if (!hint) return
    setDurationEdited(false)
    const hm = hoursToHM(hint.typical)
    setValues((v) => ({ ...v, durH: String(hm.h), durM: String(hm.m) }))
    onDirty?.()
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return // duplicate-submission guard (the button is also disabled)
    setSubmitted(true)
    if (payload) onSubmit(payload)
    else document.getElementById(Object.keys(errors)[0] === 'duration' ? 'durH' : Object.keys(errors)[0])?.focus()
  }

  function swapRoute() {
    if (!values.source || !values.destination) return
    setValues((prev) => {
      let next = cascade({ ...prev, source: prev.destination, destination: prev.source }, options)
      if (!durationEdited) {
        const h = durationHint(options, next.source, next.destination, next.stops)
        const hm = h ? hoursToHM(h.typical) : { h: '', m: '' }
        next = { ...next, durH: String(hm.h), durM: String(hm.m) }
      }
      return next
    })
    onDirty?.()
  }

  function handleReset() {
    setDurationEdited(false)
    setValues(INITIAL_VALUES)
    setTouched({})
    setSubmitted(false)
    onDirty?.()
  }

  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  const step = (n, id, title) => (
    <h3 id={id} className="flex items-center gap-3 text-sm font-semibold text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan/30 bg-cyan/[0.08] font-mono text-xs text-cyan">{n}</span>{title}
    </h3>
  )
  const daysValid = Number(values.days_left) >= dMin && Number(values.days_left) <= dMax

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Fare estimate form" className="space-y-7">
      <section aria-labelledby="route-h" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          {step('01', 'route-h', 'Route')}
          <button type="button" onClick={swapRoute} disabled={!values.source || !values.destination} aria-label="Swap origin and destination"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-3.5 text-sm font-semibold text-mist transition hover:border-cyan/50 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-40">
            <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />Swap
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          <Field id="source" label="From" error={show('source')}>
            {(p) => <SelectInput {...p} options={cities} placeholder="Select origin" value={values.source} onChange={(e) => update('source', e.target.value)} onBlur={blur('source')} />}
          </Field>
          <Field id="destination" label="To" error={show('destination')}>
            {(p) => (
              <SelectInput {...p} options={destinations} placeholder={values.source ? 'Select destination' : 'Choose origin first'} disabled={!values.source}
                value={values.destination} onChange={(e) => update('destination', e.target.value)} onBlur={blur('destination')} />
            )}
          </Field>
        </div>
      </section>

      <section aria-labelledby="flight-h" className="space-y-4">
        {step('02', 'flight-h', 'Flight')}
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          <Field id="airline" label="Airline" hint={values.source && values.destination && !airlines.length ? 'No airline serves this route in the data.' : undefined} error={show('airline')}>
            {(p) => (
              <SelectInput {...p} options={airlines} placeholder={values.destination ? 'Select airline' : 'Choose a route first'} disabled={!values.destination}
                value={values.airline} onChange={(e) => update('airline', e.target.value)} onBlur={blur('airline')} />
            )}
          </Field>
          <Field id="travel_class" label="Travel class" hint={values.airline && classes.length === 1 ? `${values.airline} offers only ${classes[0]} on this route.` : undefined} error={show('travel_class')}>
            {(p) => (
              <SelectInput {...p} options={classes} placeholder={values.airline ? 'Select class' : 'Choose an airline first'} disabled={!values.airline}
                value={values.travel_class} onChange={(e) => update('travel_class', e.target.value)} onBlur={blur('travel_class')} />
            )}
          </Field>
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-semibold text-mist">Stops</legend>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-night-850/80 p-1">
            {options.stops.map((s) => (
              <label key={s} className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-semibold text-mist transition hover:text-ink has-[:checked]:bg-[linear-gradient(135deg,rgb(76_141_255/0.28),rgb(63_208_238/0.16))] has-[:checked]:text-ink has-[:checked]:shadow-[inset_0_0_0_1px_rgb(63_208_238/0.45)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan">
                <input type="radio" name="stops" value={s} checked={values.stops === s} onChange={() => update('stops', s)} className="sr-only" />
                {STOPS_LABEL[s] ?? s}
              </label>
            ))}
          </div>
          {show('stops') && <p className="mt-1.5 text-sm font-medium text-danger">{show('stops')}</p>}
        </fieldset>
      </section>

      <section aria-labelledby="timing-h" className="space-y-4">
        {step('03', 'timing-h', 'Timing')}
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          <Field id="departure_time" label="Departure time" hint="Accepted, but this model version does not use it, so it does not change the estimate." error={show('departure_time')}>
            {(p) => <input {...p} type="time" className={inputClass} value={values.departure_time} onChange={(e) => update('departure_time', e.target.value)} onBlur={blur('departure_time')} />}
          </Field>

          <div role="group" aria-labelledby="duration-label" aria-describedby="duration-hint duration-error" className="min-w-0">
            <span id="duration-label" className="mb-1.5 block text-sm font-semibold text-mist">Total flight duration</span>
            <div className="grid grid-cols-2 gap-3">
              {[['durH', 'Hours', 'h'], ['durM', 'Minutes', 'm']].map(([k, label, unit]) => (
                <div key={k} className="relative">
                  <input id={k} aria-label={label} aria-invalid={show('duration') ? true : undefined} inputMode="numeric" autoComplete="off" placeholder="0"
                    className={`${inputClass} pr-9 font-mono`} value={values[k]} onChange={(e) => updateDuration(k, e.target.value)} onBlur={blur('duration')} />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-fog">{unit}</span>
                </div>
              ))}
            </div>
            <p id="duration-hint" className="mt-1.5 text-[0.8125rem] leading-snug text-fog">
              {hint ? <>Typical for this route: {hoursToHM(hint.typical).h}h {hoursToHM(hint.typical).m}m. </> : null}
              Supported: {hoursToHM(range[0]).h}h {hoursToHM(range[0]).m}m to {hoursToHM(range[1]).h}h {hoursToHM(range[1]).m}m.
              {hint && durationEdited && (
                <button type="button" onClick={useTypicalDuration} className="ml-1 font-semibold text-cyan underline underline-offset-2">Use typical</button>
              )}
            </p>
            {show('duration') && <p id="duration-error" className="mt-1.5 text-sm font-medium text-danger">{show('duration')}</p>}
          </div>
        </div>

        <Field id="days_left" label="Days before departure" hint={`Supported lead time: ${dMin} to ${dMax} days.`} error={show('days_left')}>
          {(p) => (
            <div className="space-y-3">
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-4">
                <input {...p} type="number" inputMode="numeric" min={dMin} max={dMax} step="1" className={`${inputClass} font-mono`} value={values.days_left}
                  onChange={(e) => update('days_left', e.target.value)} onBlur={blur('days_left')} />
                <input type="range" aria-label="Days before departure (slider)" min={dMin} max={dMax} step="1" className="h-12 w-full cursor-pointer accent-[#3fd0ee]"
                  value={daysValid ? values.days_left : dMin} onChange={(e) => update('days_left', e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Lead time presets">
                {[3, 7, 14, 30, 45].map((d) => (
                  <button key={d} type="button" onClick={() => update('days_left', String(d))} aria-pressed={String(d) === String(values.days_left)}
                    className="min-h-11 rounded-full border border-white/10 px-4 font-mono text-[0.8125rem] text-mist transition hover:border-white/25 hover:text-ink aria-pressed:border-cyan/50 aria-pressed:bg-cyan/10 aria-pressed:text-cyan">
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
      </section>

      <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-6 sm:flex-row">
        <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full sm:flex-1">
          {submitting ? <><Spinner /> Estimating…</> : <><Plane aria-hidden="true" className="h-5 w-5" /> Estimate fare</>}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset} disabled={submitting} className="w-full sm:w-auto">Reset</Button>
      </div>
    </form>
  )
}
