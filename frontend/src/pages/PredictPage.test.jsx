import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { OPTIONS, RESULT, json, stubFetch } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

const renderApp = (path = '/predict') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

async function fillAndSubmit(user, { airline = 'Vistara', cls = 'Economy' } = {}) {
  await screen.findByLabelText('From')
  await user.selectOptions(screen.getByLabelText('From'), 'Delhi')
  await user.selectOptions(screen.getByLabelText('To'), 'Mumbai')
  await user.selectOptions(screen.getByLabelText('Airline'), airline)
  await user.selectOptions(screen.getByLabelText('Travel class'), cls)
  await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
}

describe('Predict page with a stubbed backend (unit-test doubles)', () => {
  it('loads options, posts the itinerary and renders the returned fare and transparency text', async () => {
    const { calls } = stubFetch()
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText(/Loading supported options/)).toBeInTheDocument()
    await fillAndSubmit(user)
    expect(await screen.findByTestId('predicted-fare')).toHaveTextContent('₹7,220')
    const post = calls.find((c) => c.path === '/predict')
    expect(post.method).toBe('POST')
    expect(post.body).toMatchObject({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy', days_left: 14 })
    // transparency requirements
    expect(screen.getAllByText(/11\.4/).length).toBeGreaterThan(0)
    expect(screen.getByText(/model-level statistic, not a confidence score/)).toBeInTheDocument()
    expect(screen.getByText(/Estimates are not live or real-time fares/)).toBeInTheDocument()
    expect(screen.getByText(/does not use departure time/)).toBeInTheDocument()
    expect(screen.getByText('Route: Delhi to Mumbai')).toBeInTheDocument()
    const lead = screen.getByRole('heading', { name: /other lead times/ }).closest('section')
    expect(within(lead).getAllByRole('listitem')).toHaveLength(8)
  })

  it('shows SHAP shares for the factors when insights are available', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    const drivers = (await screen.findByRole('heading', { name: /pays attention to/ })).closest('section')
    expect(within(drivers).getByText('54.3%')).toBeInTheDocument()
  })

  it('swaps origin and destination', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderApp()
    await screen.findByLabelText('From')
    await user.selectOptions(screen.getByLabelText('From'), 'Delhi')
    await user.selectOptions(screen.getByLabelText('To'), 'Mumbai')
    await user.click(screen.getByRole('button', { name: 'Swap origin and destination' }))
    expect(screen.getByLabelText('From')).toHaveValue('Mumbai')
    expect(screen.getByLabelText('To')).toHaveValue('Delhi')
  })

  it('shows a loading state and prevents duplicate submissions', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const { calls } = stubFetch({ '/predict': async () => { await gate; return json(RESULT) } })
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    const btn = await screen.findByRole('button', { name: /Estimating/ })
    expect(btn).toBeDisabled()
    expect(screen.getByText('Running the model…')).toBeInTheDocument()
    await user.click(btn)
    await user.keyboard('{Enter}')
    release()
    await screen.findByTestId('predicted-fare')
    expect(calls.filter((c) => c.path === '/predict')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Estimate fare/ })).toBeEnabled()
  })

  it('renders the unsupported-itinerary error from the backend', async () => {
    stubFetch({ '/predict': json({ error: 'unsupported_itinerary', message: 'Indigo does not offer Business here.', fields: [{ field: 'travel_class', message: 'Indigo does not offer Business here.' }] }, 422) })
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('This itinerary can’t be estimated')
    expect(screen.queryByTestId('predicted-fare')).not.toBeInTheDocument()
  })

  it.each([[503, /isn't available/], [500, /valid prediction/]])('shows a friendly message for HTTP %s', async (status, text) => {
    stubFetch({ '/predict': json({ error: 'x', message: 'internal detail' }, status) })
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(text)
    expect(alert).not.toHaveTextContent('internal detail')
  })

  it('handles backend connection failure and recovers on the next try', async () => {
    let fail = true
    stubFetch({ '/predict': async () => { if (fail) throw new TypeError('Failed to fetch'); return json(RESULT) } })
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the prediction service/)
    fail = false
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    expect(await screen.findByTestId('predicted-fare')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when options cannot be loaded', async () => {
    let fail = true
    stubFetch({ '/options': async () => { if (fail) throw new TypeError('down'); return json(OPTIONS) } })
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText(/Couldn't load the supported options/)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('From')).toBeInTheDocument()
  })

  it('supports repeated predictions and marks the result stale after edits', async () => {
    let n = 0
    stubFetch({ '/predict': async () => json({ ...RESULT, predicted_fare_inr: 7000 + 111 * ++n }) })
    const user = userEvent.setup()
    renderApp()
    await fillAndSubmit(user)
    expect(await screen.findByTestId('predicted-fare')).toHaveTextContent('₹7,111')
    await user.selectOptions(screen.getByLabelText('Airline'), 'Air India')
    expect(screen.getByText(/You changed the form/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Travel class'), 'Business')
    await user.click(screen.getByRole('button', { name: /Estimate fare/ }))
    await waitFor(() => expect(screen.getByTestId('predicted-fare')).toHaveTextContent('₹7,222'))
    expect(screen.queryByText(/You changed the form/)).not.toBeInTheDocument()
  })

  it('shows the empty state before the first prediction', async () => {
    stubFetch()
    renderApp()
    expect(await screen.findByText('Your estimate will appear here')).toBeInTheDocument()
  })
})

describe('Landing page', () => {
  it('renders the hero, real coverage facts and calls to action, with the 3D layer falling back when WebGL is absent', async () => {
    stubFetch()
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Understand airfares\.\s*Travel smarter\./)
    expect(screen.getAllByRole('link', { name: /Estimate a fare/ })[0]).toHaveAttribute('href', '/predict')
    // jsdom has no WebGL: the static aircraft illustration is used
    expect(document.querySelector('svg[aria-label*="passenger aircraft"]')).toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
    expect(document.querySelector('svg[aria-label*="passenger aircraft"]').closest('[aria-hidden="true"]')).not.toBeNull() // decorative
    const strip = await screen.findByText('Routes')
    await waitFor(() => expect(strip.closest('div')).toHaveTextContent('42'))
    expect(screen.getByText('Typical error, unseen flights').closest('div')).toHaveTextContent('11.4%')
    expect(await screen.findByRole('table', { name: /Routes per airline/ })).toBeInTheDocument()
    expect(screen.queryByText(/real-time prices|live fares guaranteed/i)).not.toBeInTheDocument()
  })

  it('still renders when the backend is down (facts show placeholders)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Routes').closest('div')).toHaveTextContent('—')
  })
})

describe('Methodology page', () => {
  it('shows evaluation, SHAP factors and limits from the API', async () => {
    stubFetch()
    renderApp('/methodology')
    expect(await screen.findByRole('heading', { name: 'About the model' })).toBeInTheDocument()
    expect(await screen.findByText(/How well did it do in testing/)).toBeInTheDocument()
    expect(screen.getAllByText('11.4%').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /What the model pays attention to/ })).toBeInTheDocument()
    expect(screen.getByText(/Unseen airlines, routes and future market periods have not been independently validated/)).toBeInTheDocument()
  })
  it('redirects the old /about link', async () => {
    stubFetch()
    renderApp('/about')
    expect(await screen.findByRole('heading', { name: 'About the model' })).toBeInTheDocument()
  })
})

describe('Navigation', () => {
  it('moves between pages and shows a 404 page', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderApp('/predict')
    await user.click(screen.getAllByRole('link', { name: 'About the model' })[0])
    expect(await screen.findByRole('heading', { name: 'About the model' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('link', { name: 'Estimate fare' })[0])
    expect(await screen.findByRole('heading', { name: 'Estimate an airfare' })).toBeInTheDocument()
  })
  it('renders not-found for unknown paths', () => {
    stubFetch()
    renderApp('/nowhere')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
  it('toggles the mobile menu, focuses it and closes on Escape', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderApp()
    const btn = screen.getByRole('button', { name: 'Open menu' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(btn)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Home'))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })
})
