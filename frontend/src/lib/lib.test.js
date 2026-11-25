import { describe, expect, it } from 'vitest'
import { OPTIONS } from '../test/fixtures'
import { formatDuration, formatInr, formatTime, hmToHours, hoursToHM } from './format'
import { cascade } from './formState'
import { airlinesFor, classesFor, destinationsFor, durationHint, sourceCities } from './options'
import { validateForm } from './validate'

const good = { source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy', stops: 'non-stop', durH: '2', durM: '10', departure_time: '09:00', days_left: '14' }

describe('format', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatInr(7220)).toBe('₹7,220')
    expect(formatInr(125000)).toBe('₹1,25,000')
  })
  it('converts durations', () => {
    expect(hoursToHM(2.1667)).toEqual({ h: 2, m: 10 })
    expect(formatDuration(2.25)).toBe('2h 15m')
    expect(formatDuration(3)).toBe('3h')
    expect(hmToHours('2', '30')).toBe(2.5)
  })
  it('formats time', () => expect(formatTime('09:05')).toBe('9:05 AM (09:05)'))
})

describe('options helpers use only real supported combinations', () => {
  it('lists the seven cities and never offers First class', () => {
    expect(sourceCities(OPTIONS)).toHaveLength(7)
    const classes = new Set(Object.values(OPTIONS.airline_class_routes).flatMap((a) => Object.keys(a)))
    expect(classes).toEqual(new Set(['Economy', 'Premium Economy', 'Business']))
  })
  it('destinations exclude the origin', () => expect(destinationsFor(OPTIONS, 'Delhi')).not.toContain('Delhi'))
  it('class options depend on airline and route', () => {
    expect(classesFor(OPTIONS, 'Indigo', 'Delhi', 'Mumbai')).toEqual(['Economy'])
    expect(classesFor(OPTIONS, 'Vistara', 'Delhi', 'Mumbai')).toEqual(['Economy', 'Premium Economy', 'Business'])
    expect(classesFor(OPTIONS, 'Indigo', '', '')).toEqual([])
  })
  it('airlines depend on the route', () => {
    expect(airlinesFor(OPTIONS, 'Delhi', 'Mumbai')).toContain('Vistara')
    expect(airlinesFor(OPTIONS, '', 'Mumbai')).toEqual([])
  })
  it('provides duration hints from data', () => expect(durationHint(OPTIONS, 'Delhi', 'Mumbai', 'non-stop').typical).toBeGreaterThan(1))
  it('cascade clears invalid dependents and auto-selects a single class', () => {
    expect(cascade({ ...good, destination: 'Delhi' }, OPTIONS).destination).toBe('')
    expect(cascade({ ...good, airline: 'Indigo', travel_class: '' }, OPTIONS).travel_class).toBe('Economy')
    expect(cascade({ ...good, airline: 'Indigo', travel_class: 'Business' }, OPTIONS).travel_class).toBe('Economy')
  })
})

describe('validateForm mirrors backend rules', () => {
  it('accepts a valid form and builds the API payload', () => {
    const { errors, payload } = validateForm(good, OPTIONS)
    expect(errors).toEqual({})
    expect(payload).toEqual({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy', departure_time: '09:00', stops: 'non-stop', duration_hours: 2.1667, days_left: 14 })
  })
  it.each([['0'], ['51'], ['2.5'], [''], ['abc']])('rejects days_left %s', (d) => expect(validateForm({ ...good, days_left: d }, OPTIONS).errors.days_left).toBeTruthy())
  it.each([['1'], ['50']])('accepts days_left %s', (d) => expect(validateForm({ ...good, days_left: d }, OPTIONS).errors.days_left).toBeUndefined())
  it('rejects same origin and destination', () => expect(validateForm({ ...good, destination: 'Delhi' }, OPTIONS).errors.destination).toMatch(/different/))
  it('rejects unsupported class for airline', () => expect(validateForm({ ...good, airline: 'Indigo', travel_class: 'Business' }, OPTIONS).errors.travel_class).toBeTruthy())
  it('rejects durations outside the supported range for the stops', () => {
    expect(validateForm({ ...good, durH: '10', durM: '0' }, OPTIONS).errors.duration).toMatch(/non-stop/)
    expect(validateForm({ ...good, durH: '0', durM: '0' }, OPTIONS).errors.duration).toBeTruthy()
    expect(validateForm({ ...good, durM: '75' }, OPTIONS).errors.duration).toBeTruthy()
  })
  it('requires a time and stops', () => {
    expect(validateForm({ ...good, departure_time: '' }, OPTIONS).errors.departure_time).toBeTruthy()
    expect(validateForm({ ...good, stops: '' }, OPTIONS).errors.stops).toBeTruthy()
  })
})
