import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OPTIONS } from '../test/fixtures'
import PredictionForm from './PredictionForm'

const setup = (props = {}) => {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  render(<PredictionForm options={OPTIONS} onSubmit={onSubmit} {...props} />)
  return { user, onSubmit }
}
const optionsOf = (label) => within(screen.getByLabelText(label)).getAllByRole('option').map((o) => o.textContent)

async function fillValid(user, { airline = 'Vistara', cls = 'Economy' } = {}) {
  await user.selectOptions(screen.getByLabelText('From'), 'Delhi')
  await user.selectOptions(screen.getByLabelText('To'), 'Mumbai')
  await user.selectOptions(screen.getByLabelText('Airline'), airline)
  if (cls) await user.selectOptions(screen.getByLabelText('Travel class'), cls)
}

describe('PredictionForm dynamic dropdowns', () => {
  it('starts with dependent controls disabled', () => {
    setup()
    expect(screen.getByLabelText('To')).toBeDisabled()
    expect(screen.getByLabelText('Airline')).toBeDisabled()
    expect(screen.getByLabelText('Travel class')).toBeDisabled()
  })

  it('destination excludes the origin; airline and class follow the route', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('From'), 'Delhi')
    expect(optionsOf('To')).not.toContain('Delhi')
    await user.selectOptions(screen.getByLabelText('To'), 'Mumbai')
    expect(optionsOf('Airline')).toContain('Vistara')
    await user.selectOptions(screen.getByLabelText('Airline'), 'Vistara')
    expect(optionsOf('Travel class')).toEqual(['Select class', 'Economy', 'Premium Economy', 'Business'])
  })

  it('offers only the classes an airline sells and auto-selects a single one; never First', async () => {
    const { user } = setup()
    await fillValid(user, { airline: 'Indigo', cls: null })
    expect(optionsOf('Travel class')).toEqual(['Select class', 'Economy'])
    expect(screen.getByLabelText('Travel class')).toHaveValue('Economy')
    for (const label of ['From', 'To', 'Airline', 'Travel class']) expect(optionsOf(label)).not.toContain('First')
  })

  it('clears dependent choices that become invalid', async () => {
    const { user } = setup()
    await fillValid(user)
    await user.selectOptions(screen.getByLabelText('From'), 'Mumbai') // Mumbai -> Mumbai is impossible
    expect(screen.getByLabelText('To')).toHaveValue('')
    expect(screen.getByLabelText('Airline')).toBeDisabled()
  })

  it('prefills a typical duration from the route and lets the user edit it', async () => {
    const { user } = setup()
    await fillValid(user)
    expect(screen.getByLabelText('Hours')).toHaveValue('2')
    expect(screen.getByText(/Typical for this route/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Hours'))
    await user.type(screen.getByLabelText('Hours'), '3')
    expect(screen.getByLabelText('Hours')).toHaveValue('3')
    expect(screen.getByRole('button', { name: 'Use typical' })).toBeInTheDocument()
  })

  it('shows the supported lead-time range and the departure-time note', () => {
    setup()
    expect(screen.getByText('Supported lead time: 1 to 50 days.')).toBeInTheDocument()
    expect(screen.getByText(/does not use it/)).toBeInTheDocument()
  })
})

describe('PredictionForm validation and submit', () => {
  it('blocks an empty submit, shows errors and does not call the API', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Choose an origin city.')).toBeInTheDocument()
    expect(screen.getByText('Enter the duration as whole hours and minutes (minutes 0 to 59).')).toBeInTheDocument()
  })

  it.each(['0', '51'])('rejects lead time %s', async (d) => {
    const { user, onSubmit } = setup()
    await fillValid(user)
    await user.clear(screen.getByRole('spinbutton'))
    await user.type(screen.getByRole('spinbutton'), d)
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    expect(screen.getByText('Enter a whole number of days from 1 to 50.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an unsupported duration for the chosen stops', async () => {
    const { user, onSubmit } = setup()
    await fillValid(user)
    await user.clear(screen.getByLabelText('Hours'))
    await user.type(screen.getByLabelText('Hours'), '12')
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    expect(screen.getByText(/For non-stop itineraries the model supports/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits exactly the API payload when valid', async () => {
    const { user, onSubmit } = setup()
    await fillValid(user, { cls: 'Business' })
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const p = onSubmit.mock.calls[0][0]
    expect(p).toMatchObject({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Business', departure_time: '09:00', stops: 'non-stop', days_left: 14 })
    expect(p.duration_hours).toBeGreaterThan(1)
    expect(Object.keys(p).sort()).toEqual(['airline', 'days_left', 'departure_time', 'destination', 'duration_hours', 'source', 'stops', 'travel_class'])
  })

  it('disables submission while a request is running', async () => {
    const { user, onSubmit } = setup({ submitting: true })
    const btn = screen.getByRole('button', { name: /Estimating/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    await user.click(btn)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('reset restores the defaults', async () => {
    const { user } = setup()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('From')).toHaveValue('')
    expect(screen.getByLabelText('To')).toBeDisabled()
  })

  it('shows backend field errors next to the fields', () => {
    setup({ serverFields: [{ field: 'airline', message: 'Airline not supported here' }] })
    expect(screen.getByText('Airline not supported here')).toBeInTheDocument()
  })
})
