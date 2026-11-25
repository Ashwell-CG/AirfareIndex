import { useCallback, useRef, useState } from 'react'
import PredictionForm from '../components/PredictionForm'
import ResultPanel from '../components/ResultPanel'
import { RouteArc } from '../components/results/pieces'
import { Alert, Button, Panel, Spinner } from '../components/ui/ui'
import { useResource } from '../hooks/useResource'
import { getInsights, getOptions, predictFare } from '../services/api'

const loadOptions = () => getOptions()
const loadInsights = () => getInsights()

export default function PredictPage() {
  const options = useResource('options', loadOptions)
  const insights = useResource('insights', loadInsights)
  const [state, setState] = useState({ status: 'idle', result: null, error: null })
  const [stale, setStale] = useState(false)
  const inFlight = useRef(false)

  async function submit(payload) {
    if (inFlight.current) return // second guard against duplicate submissions
    inFlight.current = true
    setState((s) => ({ status: 'loading', result: s.result, error: null }))
    try {
      const result = await predictFare(payload)
      setState({ status: 'success', result, error: null })
      setStale(false)
    } catch (error) {
      setState((s) => ({ status: 'error', result: s.result, error }))
    } finally {
      inFlight.current = false
    }
  }

  const loading = state.status === 'loading'
  const markDirty = useCallback(() => setStale(true), [])

  return (
    <div className="relative">
      <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[28rem]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-20 pt-24 sm:px-6 lg:px-10 lg:pt-28">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Flight deck · Fare estimator</p>
          <h1 className="mt-3 font-display text-[clamp(2.4rem,5vw,4rem)] leading-[1] text-ink">Estimate an airfare</h1>
          <p className="mt-3 text-lg leading-relaxed text-mist">Enter an Indian domestic itinerary to get a fare estimate in INR from the trained model.</p>
        </div>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:gap-8">
          <div className="min-w-0 lg:sticky lg:top-24">
            <Panel>
              {options.status === 'loading' && <p className="flex items-center gap-3 text-mist" role="status"><Spinner /> Loading supported options…</p>}
              {options.status === 'error' && (
                <Alert title="Couldn't load the supported options" action={<Button variant="secondary" onClick={options.reload}>Try again</Button>}>{options.error.message}</Alert>
              )}
              {options.status === 'ready' && (
                <PredictionForm options={options.data} onSubmit={submit} onDirty={markDirty} submitting={loading} serverFields={state.error?.fields ?? []} />
              )}
            </Panel>
          </div>

          <div className="min-w-0 space-y-5">
            {state.status === 'error' && (
              <Alert title={state.error.kind === 'http' && state.error.status === 422 ? 'This itinerary can’t be estimated' : 'Estimate failed'}>
                <p>{state.error.message}</p>
                {state.error.fields?.length > 0 && (
                  <ul className="mt-2 list-disc pl-5">{state.error.fields.filter((f, i, a) => a.findIndex((x) => x.message === f.message) === i).map((f) => <li key={f.message}>{f.message}</li>)}</ul>
                )}
              </Alert>
            )}
            {loading && (
              <Panel aria-busy="true" className="text-center">
                <RouteArc loop className="mx-auto h-auto w-full max-w-sm" />
                <p className="mt-2 flex items-center justify-center gap-3 text-mist" role="status"><Spinner className="h-5 w-5" /> Running the model…</p>
              </Panel>
            )}
            {state.result && <ResultPanel result={state.result} stale={stale && !loading} insights={insights.data} />}
            {!state.result && !loading && state.status !== 'error' && (
              <Panel className="py-12 text-center">
                <RouteArc runKey="empty" className="mx-auto h-auto w-full max-w-xs opacity-80" />
                <h2 className="mt-4 font-display text-3xl text-ink">Your estimate will appear here</h2>
                <p className="mx-auto mt-2 max-w-md text-mist">Choose a route, airline and class, then select “Estimate fare”. Estimates come from a model trained on historical listed fares from January to March 2023 and are not live prices.</p>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
