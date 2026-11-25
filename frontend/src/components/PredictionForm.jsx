import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plane } from 'lucide-react'
import { Button, Field, FieldError, SelectInput, Spinner, inputClass } from './ui/ui'
import { hoursToHM } from '../lib/format'
import { dateFromToday, daysFromToday } from '../lib/dates'
import { STOPS_LABEL, airlinesFor, classesFor, destinationsFor, durationHint, durationRange, sourceCities } from '../lib/options'
import { INITIAL_VALUES, cascade } from '../lib/formState'
import { validateForm } from '../lib/validate'

const SERVER_FIELD = { duration_hours: 'duration' }

function Group({ id, title, action, children }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 id={id} className="display-md text-[1.625rem] text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

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
  const days = Number(values.days_left)
  const daysValid = Number.isInteger(days) && days >= dMin && days <= dMax

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

  function updateDate(isoDate) {
    const d = daysFromToday(isoDate)
    update('days_left', Number.isNaN(d) ? '' : String(d))
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
  const fmtHM = (h) => `${hoursToHM(h).h}h ${hoursToHM(h).m}m`

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Fare estimate form" className="space-y-9">
      <Group id="route-h" title="Route" action={
        <button type="button" onClick={swapRoute} disabled={!values.source || !values.destination} aria-label="Swap origin and destination"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-4 text-sm font-semibold text-mist transition hover:border-cyan/60 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowLeftRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-enabled:group-hover:rotate-180" />Swap
        </button>
      }>
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
      </Group>

      <Group id="flight-h" title="Flight">
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
          <legend className="mb-2 text-sm font-semibold text-mist">Stops</legend>
          <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-night-950/55 p-1">
            {options.stops.map((s) => (
              <label key={s} className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-sm font-semibold text-mist transition hover:text-ink has-[:checked]:bg-cyan has-[:checked]:text-night-950 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan">
                <input type="radio" name="stops" value={s} checked={values.stops === s} onChange={() => update('stops', s)} className="sr-only" />
                {STOPS_LABEL[s] ?? s}
              </label>
            ))}
          </div>
          {show('stops') && <FieldError>{show('stops')}</FieldError>}
        </fieldset>

        <div role="group" aria-labelledby="duration-label" aria-describedby="duration-hint duration-error" className="min-w-0">
          <span id="duration-label" className="mb-2 block text-sm font-semibold text-mist">Total flight duration</span>
          <div className="grid grid-cols-2 gap-3">
            {[['durH', 'Hours', 'h'], ['durM', 'Minutes', 'm']].map(([k, label, unit]) => (
              <div key={k} className="relative">
                <input id={k} aria-label={label} aria-invalid={show('duration') ? true : undefined} inputMode="numeric" autoComplete="off" placeholder="0"
                  className={`${inputClass} pr-10 tabular`} value={values[k]} onChange={(e) => updateDuration(k, e.target.value)} onBlur={blur('duration')} />
                <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fog">{unit}</span>
              </div>
            ))}
          </div>
          <p id="duration-hint" className="mt-2 text-[0.8125rem] leading-snug text-fog">
            {hint ? <>Typical for this route: {fmtHM(hint.typical)}. </> : null}
            Supported: {fmtHM(range[0])} to {fmtHM(range[1])}.
            {hint && durationEdited && (
              <button type="button" onClick={useTypicalDuration} className="ml-1 font-semibold text-cyan underline underline-offset-2">Use typical</button>
            )}
          </p>
          {show('duration') && <FieldError id="duration-error">{show('duration')}</FieldError>}
        </div>
      </Group>

      <Group id="timing-h" title="When">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <label htmlFor="travel_date" className="mb-2 block text-sm font-semibold text-mist">Travel date</label>
            <input id="travel_date" type="date" className={`${inputClass} tabular`} min={dateFromToday(dMin)} max={dateFromToday(dMax)}
              value={daysValid ? dateFromToday(days) : ''} aria-describedby="travel_date-hint" aria-invalid={show('days_left') ? true : undefined}
              onChange={(e) => updateDate(e.target.value)} onBlur={blur('days_left')} />
            <p id="travel_date-hint" className="mt-2 text-[0.8125rem] leading-snug text-fog">The model uses how many days ahead you book, not the calendar date.</p>
          </div>
          <Field id="days_left" label="Days before departure" hint={`Supported lead time: ${dMin} to ${dMax} days.`} error={show('days_left')}>
            {(p) => (
              <input {...p} type="number" inputMode="numeric" min={dMin} max={dMax} step="1" className={`${inputClass} tabular`} value={values.days_left}
                onChange={(e) => update('days_left', e.target.value)} onBlur={blur('days_left')} />
            )}
          </Field>
        </div>
        <Field id="departure_time" label="Departure time" hint="Accepted, but this model version does not use it, so it does not change the estimate." error={show('departure_time')}>
          {(p) => <input {...p} type="time" className={`${inputClass} tabular min-[480px]:max-w-[14rem]`} value={values.departure_time} onChange={(e) => update('departure_time', e.target.value)} onBlur={blur('departure_time')} />}
        </Field>
      </Group>

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-7 sm:flex-row">
        <Button type="submit" disabled={submitting} aria-busy={submitting} className="min-h-14 w-full text-[1.0625rem] sm:flex-1">
          {submitting ? <><Spinner /> Estimating…</> : <><Plane aria-hidden="true" className="h-5 w-5" /> Estimate fare</>}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset} disabled={submitting} className="min-h-14 w-full sm:w-auto">Reset</Button>
      </div>
    </form>
  )
}
