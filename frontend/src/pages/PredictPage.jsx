import { useCallback, useRef, useState } from 'react'
import PredictionForm from '../components/PredictionForm'
import ResultPanel from '../components/ResultPanel'
import { RouteArc } from '../components/results/pieces'
import { Alert, Button, Spinner } from '../components/ui/ui'
import { useResource } from '../hooks/useResource'
import { iata } from '../lib/airports'
import { dateFromToday } from '../lib/dates'
import { getInsights, getOptions, predictFare } from '../services/api'

const loadOptions = () => getOptions()
const loadInsights = () => getInsights()

function Waiting({ request }) {
  return (
    <section aria-busy="true" className="glass overflow-hidden rounded-[2rem] p-6 text-center sm:p-10">
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <span className="display-xl text-5xl text-ink">{request ? iata(request.source) : '···'}</span>
        <RouteArc loop className="h-auto w-full max-w-[16rem]" />
        <span className="display-xl text-5xl text-ink">{request ? iata(request.destination) : '···'}</span>
      </div>
      <p className="mt-6 flex items-center justify-center gap-3 text-mist" role="status"><Spinner className="h-5 w-5 text-cyan" />Running the model…</p>
      <p className="mt-2 text-sm text-fog">The first request after a quiet period can take up to a minute while the server wakes up.</p>
    </section>
  )
}

function Empty() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-dashed border-white/15 px-6 py-14 text-center sm:px-10">
      <RouteArc runKey="empty" className="mx-auto h-auto w-full max-w-xs opacity-80" />
      <h2 className="display-lg mt-6 text-[clamp(2.25rem,4vw,3rem)] text-ink">Your estimate will appear here</h2>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-mist">Choose a route, airline and cabin, then select “Estimate fare”. Estimates come from a model trained on historical listed fares from January to March 2023 and are not live prices.</p>
    </section>
  )
}

export default function PredictPage() {
  const options = useResource('options', loadOptions)
  const insights = useResource('insights', loadInsights)
  const [state, setState] = useState({ status: 'idle', result: null, error: null, request: null, travelDate: null })
  const [stale, setStale] = useState(false)
  const inFlight = useRef(false)

  async function submit(payload) {
    if (inFlight.current) return // second guard against duplicate submissions
    inFlight.current = true
    const travelDate = dateFromToday(payload.days_left)
    setState((s) => ({ ...s, status: 'loading', error: null, request: payload }))
    try {
      const result = await predictFare(payload)
      setState({ status: 'success', result, error: null, request: payload, travelDate })
      setStale(false)
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error }))
    } finally {
      inFlight.current = false
    }
  }

  const loading = state.status === 'loading'
  const markDirty = useCallback(() => setStale(true), [])

  return (
    <div className="relative isolate">
      <div className="sky pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] opacity-80 [mask-image:linear-gradient(180deg,black_40%,transparent)]" aria-hidden="true" />
      <div className="starfield pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] opacity-60" aria-hidden="true" />
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-24 sm:px-6 lg:px-10 lg:pt-32">
        <header className="mb-10 max-w-3xl lg:mb-14">
          <h1 className="display-xl text-[clamp(3.25rem,7vw,6rem)] text-ink">Estimate an airfare</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-mist">Enter an Indian domestic itinerary. The trained model returns an estimate in rupees, based on historical listed fares, not today’s prices.</p>
        </header>
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,33rem)_minmax(0,1fr)] xl:gap-12">
          <div className="min-w-0 lg:sticky lg:top-28">
            <section className="glass rounded-[2rem] p-5 sm:p-8">
              {options.status === 'loading' && <p className="flex items-center gap-3 text-mist" role="status"><Spinner className="h-5 w-5 text-cyan" /> Loading supported options…</p>}
              {options.status === 'error' && (
                <Alert title="Couldn't load the supported options" action={<Button variant="secondary" onClick={options.reload}>Try again</Button>}>{options.error.message}</Alert>
              )}
              {options.status === 'ready' && (
                <PredictionForm options={options.data} onSubmit={submit} onDirty={markDirty} submitting={loading} serverFields={state.error?.fields ?? []} />
              )}
            </section>
          </div>

          <div className="min-w-0 space-y-6">
            {state.status === 'error' && (
              <Alert title={state.error.kind === 'http' && state.error.status === 422 ? 'This itinerary can’t be estimated' : 'Estimate failed'}>
                <p>{state.error.message}</p>
                {state.error.fields?.length > 0 && (
                  <ul className="mt-2 list-disc pl-5">{state.error.fields.filter((f, i, a) => a.findIndex((x) => x.message === f.message) === i).map((f) => <li key={f.message}>{f.message}</li>)}</ul>
                )}
              </Alert>
            )}
            {loading && <Waiting request={state.request} />}
            {state.result && !loading && <ResultPanel result={state.result} stale={stale} insights={insights.data} travelDate={state.travelDate} />}
            {!state.result && !loading && state.status !== 'error' && <Empty />}
          </div>
        </div>
      </div>
    </div>
  )
}
